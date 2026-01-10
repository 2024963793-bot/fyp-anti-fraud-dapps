// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AntiFraudSystem is Ownable {
    // --- State Variables ---
    uint256 public transactionCounter;

    // --- Data Structures ---
    enum UserStatus { Inactive, Active, Suspended }

    struct User {
        string name;
        uint256 balance;
        UserStatus status;
    }

    struct Transaction {
        uint256 id;
        address from;
        address to;
        uint256 amount;
        uint256 timestamp;
        string status; // "Completed", "Flagged"
    }

    // --- Mappings ---
    mapping(address => User) public users;
    mapping(uint256 => Transaction) public transactions;
    mapping(address => bool) public blacklistedAddresses;

    // --- Anti-Fraud Rules ---
    uint256 public maxTransactionAmount; // Global Hard Limit per tx
    uint256 public minTimeBetweenTransactions; // Global Speed Limit
    
    // NEW: Personal Daily Limits
    mapping(address => uint256) public userDailyLimits; 
    mapping(address => uint256) public dailyTotalSpent; 
    mapping(address => uint256) public lastResetDay;

    // Track user activity for speed check
    mapping(address => uint256) public lastTransactionTimestamp;

    // --- Events ---
    event UserRegistered(address indexed userAddress, string name);
    event UserStatusChanged(address indexed userAddress, UserStatus newStatus);
    event TransactionMade(uint256 indexed id, address indexed from, address indexed to, uint256 amount);
    event TransactionFlagged(uint256 indexed id, address indexed from, string reason);
    event AddressBlacklisted(address indexed userAddress, string reason);
    event FraudRuleChanged(string rule, uint256 newValue);
    event UserLimitChanged(address indexed user, uint256 newLimit); // NEW Event

    // --- Constructor ---
    // We removed the global daily limit arg, as it's now per-user default
    constructor(uint256 _initialMaxTxAmount, uint256 _initialMinTime) Ownable(msg.sender) {
        maxTransactionAmount = _initialMaxTxAmount;
        minTimeBetweenTransactions = _initialMinTime;
        
        // Register Admin with a default 1000 ETH limit
        users[msg.sender] = User("Admin", 1_000_000 * (10**18), UserStatus.Active);
        userDailyLimits[msg.sender] = 1000 * (10**18); 
        emit UserRegistered(msg.sender, "Admin");
    }

    // --- Modifiers ---
    modifier onlyActiveUser() {
        require(users[msg.sender].status == UserStatus.Active, "User is not active.");
        _;
    }

    // --- User Management ---
    function registerUser(string memory _name) public {
        require(users[msg.sender].status == UserStatus.Inactive, "User already exists or is suspended.");
        users[msg.sender] = User(_name, 1000 * (10**18), UserStatus.Active);
        // Default daily limit for new users: 100 ETH
        userDailyLimits[msg.sender] = 100 * (10**18); 
        emit UserRegistered(msg.sender, _name);
    }

    function setUserStatus(address _userAddress, UserStatus _newStatus) public onlyOwner {
        require(users[_userAddress].status != UserStatus.Inactive, "User does not exist.");
        users[_userAddress].status = _newStatus;
        emit UserStatusChanged(_userAddress, _newStatus);
    }

    // --- NEW: User Self-Service Functions ---
    function changeMyDailyLimit(uint256 _newLimit) public onlyActiveUser {
        userDailyLimits[msg.sender] = _newLimit;
        emit UserLimitChanged(msg.sender, _newLimit);
    }

    // --- Core Transaction Logic ---
    function makePayment(address _to, uint256 _amount) public onlyActiveUser {
        require(users[_to].status == UserStatus.Active, "Recipient is not an active user.");
        // If the sender does not have enough balance, flag and record the attempt
        if (users[msg.sender].balance < _amount) {
            _flagTransaction(currentId, _to, _amount, "Insufficient balance.");
            return;
        }
        require(!blacklistedAddresses[msg.sender], "Sender is blacklisted.");
        require(!blacklistedAddresses[_to], "Recipient is blacklisted.");

        transactionCounter++;
        uint256 currentId = transactionCounter;
        uint256 currentDay = block.timestamp / 1 days;

        // 1. Global Max Check
        if (_amount > maxTransactionAmount) {
            _flagTransaction(currentId, _to, _amount, "Amount exceeds system hard limit.");
            return;
        }

        // 2. Speed Check
        uint256 timeSinceLastTx = block.timestamp - lastTransactionTimestamp[msg.sender];
        if (timeSinceLastTx < minTimeBetweenTransactions) {
            _flagTransaction(currentId, _to, _amount, "High-frequency transaction detected.");
            return;
        }

        // 3. User Daily Limit Check
        if (lastResetDay[msg.sender] != currentDay) {
            dailyTotalSpent[msg.sender] = 0;
            lastResetDay[msg.sender] = currentDay;
        }

        if (dailyTotalSpent[msg.sender] + _amount > userDailyLimits[msg.sender]) {
            _flagTransaction(currentId, _to, _amount, "Personal daily limit exceeded.");
            return;
        }

        // Process
        users[msg.sender].balance -= _amount;
        users[_to].balance += _amount;
        
        lastTransactionTimestamp[msg.sender] = block.timestamp;
        dailyTotalSpent[msg.sender] += _amount;

        transactions[currentId] = Transaction(currentId, msg.sender, _to, _amount, block.timestamp, "Completed");
        emit TransactionMade(currentId, msg.sender, _to, _amount);
    }

    function _flagTransaction(uint256 _id, address _to, uint256 _amount, string memory _reason) internal {
        transactions[_id] = Transaction(_id, msg.sender, _to, _amount, block.timestamp, "Flagged");
        emit TransactionFlagged(_id, msg.sender, _reason);
    }

    // View helpers
    function getUser(address _userAddress) public view returns (User memory) {
        return users[_userAddress];
    }
    function getTransaction(uint256 _id) public view returns (Transaction memory) {
        return transactions[_id];
    }
}