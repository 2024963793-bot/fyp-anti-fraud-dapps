// ...existing code...
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
// Import the ABI from the JSON file you created
import AntiFraudSystemABI from './AntiFraudSystemABI.json';

// Paste the contract address you saved from the deployment
const contractAddress = "0xB4448140135434b7F05BdEbD57BE0ef06c70DB12";

// --- Main App Component ---
function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [userName, setUserName] = useState('');
  const [userBalance, setUserBalance] = useState('0.0');
  const [isLoading, setIsLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [view, setView] = useState('dashboard'); // 'dashboard', 'payment', 'history', 'admin'
  const [toast, setToast] = useState(null);

  // Form states
  const [registerName, setRegisterName] = useState('');
  const [paymentRecipient, setPaymentRecipient] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');

  // Admin Panel states
  const [adminAddress, setAdminAddress] = useState('');
  const [adminStatus, setAdminStatus] = useState(1); // Default to Active

  // small UI helpers
  const showToast = (message, type = 'info', duration = 4000) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), duration);
  };

  const truncate = (addr, start = 6, end = 4) => {
    if (!addr) return '';
    return `${addr.substring(0, start)}...${addr.substring(addr.length - end)}`;
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Address copied to clipboard', 'success');
    } catch {
      showToast('Copy failed', 'error');
    }
  };

  // Fetches transaction history for the connected account from the blockchain
  // Only includes transactions where `from` or `to` equals the connected account
  const fetchTransactionHistory = useCallback(async (currentContract, connectedAccount) => {
    if (!currentContract || !connectedAccount) return;
    try {
      const counter = await currentContract.transactionCounter();
      const count = Number(counter);
      const history = [];
      const acctLower = connectedAccount.toLowerCase();
      for (let i = count; i >= 1; i--) {
        const tx = await currentContract.getTransaction(i);
        const from = (tx.from || '').toLowerCase();
        const to = (tx.to || '').toLowerCase();
        if (from === acctLower || to === acctLower) {
          const role = from === acctLower ? 'sent' : 'received';
          const counterparty = role === 'sent' ? tx.to : tx.from;
          history.push({
            id: Number(tx.id),
            from: tx.from,
            to: tx.to,
            counterparty,
            role,
            amount: ethers.formatEther(tx.amount),
            timestamp: new Date(Number(tx.timestamp) * 1000).toLocaleString(),
            status: tx.status,
          });
        }
      }
      setTransactions(history);
    } catch (error) {
      console.error("Failed to fetch transaction history:", error);
      showToast('Failed to load history', 'error');
    }
  }, []);

  const refreshUser = useCallback(async (antiFraudContract, connectedAccount) => {
    if (!antiFraudContract || !connectedAccount) return;
    try {
      const user = await antiFraudContract.getUser(connectedAccount);
      setUserName(user.name || '');
      setUserBalance(ethers.formatEther(user.balance || 0));
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  }, []);

  // Resets the app to its initial state (logout)
  const disconnectWallet = () => {
    setAccount(null);
    setContract(null);
    setIsOwner(false);
    setUserName('');
    setUserBalance('0.0');
    setTransactions([]);
    setView('dashboard');
    showToast('Disconnected', 'info', 2000);
  };

  // Connects to MetaMask and sets up the app state
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        setIsLoading(true);
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const signer = await provider.getSigner();
        const connectedAccount = accounts[0];
        setAccount(connectedAccount);

        const antiFraudContract = new ethers.Contract(contractAddress, AntiFraudSystemABI.abi, signer);
        setContract(antiFraudContract);

        const ownerAddress = await antiFraudContract.owner();
        setIsOwner(connectedAccount.toLowerCase() === ownerAddress.toLowerCase());

        const user = await antiFraudContract.getUser(connectedAccount);
        if (Number(user.status) === 1) { // 1 is 'Active'
          setUserName(user.name);
          setUserBalance(ethers.formatEther(user.balance || 0));
          fetchTransactionHistory(antiFraudContract, connectedAccount);
        } else {
          // Show register prompt in UI
          setUserName('');
          setUserBalance('0.0');
        }
        showToast('Wallet connected', 'success', 2000);
      } catch (error) {
        console.error("Error connecting wallet:", error);
        showToast('Failed to connect wallet', 'error');
      } finally {
        setIsLoading(false);
      }
    } else {
      showToast('Install MetaMask to use this dApp', 'error');
    }
  };

  // --- Event Handlers ---

  const handleRegister = async (e) => {
    e.preventDefault();
    if (contract && registerName) {
      setIsLoading(true);
      try {
        const tx = await contract.registerUser(registerName);
        await tx.wait();
        showToast("Registration successful!", 'success');
        const user = await contract.getUser(account);
        if (Number(user.status) === 1) {
        setUserName(user.name);
        setUserBalance(ethers.formatEther(user.balance || 0));
        fetchTransactionHistory(contract, account);
        }
      } catch (error) {
        console.error("Registration failed:", error);
        const reason = error.reason || (error.data && error.data.message) || "An unknown error occurred.";
        showToast(`Registration failed: ${reason}`, 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };
  
  const handlePayment = async (e) => {
    e.preventDefault();
    if (contract && paymentRecipient && paymentAmount) {
      if (!ethers.isAddress(paymentRecipient)) {
        showToast("Invalid recipient address", 'error');
        return;
      }
      // basic validation
      if (isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
        showToast("Invalid amount", 'error');
        return;
      }
      setIsLoading(true);
      try {
        const amountInWei = ethers.parseEther(paymentAmount);
        const tx = await contract.makePayment(paymentRecipient, amountInWei);
        await tx.wait();
        showToast("Payment successful!", 'success');
        
        await refreshUser(contract, account);
        setPaymentRecipient('');
        setPaymentAmount('');
        fetchTransactionHistory(contract, account);
      } catch (error) {
        console.error("Payment failed:", error);
        const reason = error.reason || (error.data && error.data.message) || "An unknown error occurred.";
        // Refresh history so any flagged transaction written on-chain becomes visible
        try { await fetchTransactionHistory(contract, account); } catch (e) { console.error('History refresh failed:', e); }
        showToast(`Payment failed: ${reason}`, 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSetUserStatus = async (e) => {
    e.preventDefault();
    if (contract && adminAddress) {
      if (!ethers.isAddress(adminAddress)) {
        showToast("Invalid user address", 'error');
        return;
      }
      setIsLoading(true);
      try {
        const tx = await contract.setUserStatus(adminAddress, adminStatus);
        await tx.wait();
        showToast(`User status updated for ${truncate(adminAddress)}`, 'success');
        setAdminAddress('');
      } catch (error) {
        console.error("Failed to set user status:", error);
        const reason = error.reason || (error.data && error.data.message) || "An unknown error occurred.";
        showToast(`Failed to set user status: ${reason}`, 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Refresh actions
  const refreshAll = async () => {
    if (!contract || !account) return;
    setIsLoading(true);
    try {
      await refreshUser(contract, account);
      await fetchTransactionHistory(contract, account);
      showToast('Refreshed', 'info', 1200);
    } catch {
      showToast('Refresh failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Sub-Components for Different Views ---

  const Spinner = () => (
    <div className="spinner" aria-hidden>
      <style>{`
        .spinner {
          display:inline-block;
          width:18px;height:18px;border:3px solid rgba(255,255,255,0.2);border-radius:50%;
          border-top-color:#fff;animation:spin 1s linear infinite;margin-right:8px;vertical-align:middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );

  const DashboardView = () => (
    <div>
      <div className="card">
        <div className="card-head">
          <h2>👋 Welcome{userName ? `, ${userName}` : ''}</h2>
          <div className="card-actions">
            <button className="btn subtle" onClick={refreshAll} disabled={isLoading}>{isLoading ? <><Spinner/>Refreshing</> : '🔄 Refresh'}</button>
          </div>
        </div>
        <div className="card-body grid-2">
          <div style={{padding: 12, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 12, color: '#fff'}}>
            <p style={{marginBottom:8, fontSize: 13, opacity: 0.9}}>💰 Balance</p>
            <h3 style={{marginTop:0, fontSize: 28, fontWeight: 700}}>{userBalance} MYR</h3>
            <p style={{color: 'rgba(255,255,255,0.7)', fontSize: 13}}>Available on-chain</p>
          </div>
          <div style={{padding: 12}}>
            <p style={{marginBottom:8, fontSize: 13, color: '#718096', fontWeight: 600}}>📍 Account</p>
            <div className="account-box">
              <div>
                <div style={{fontWeight:600, color: '#2d3748'}}>{truncate(account || '')}</div>
                <div style={{fontSize:12,color:'#718096',wordBreak:'break-all',marginTop: 6}}>{account}</div>
              </div>
              <div>
                <button className="btn small" onClick={() => copyToClipboard(account)}>Copy</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{display:'flex',gap:20,marginTop:20,flexWrap:'wrap'}}>
        <div style={{flex:'1 1 380px', minWidth: 320}}><PaymentViewCompact/></div>
        <div style={{flex:'1 1 380px', minWidth: 320}}><HistorySmall/></div>
      </div>
    </div>
  );

  const PaymentViewCompact = () => (
    <div className="card">
      <div className="card-head"><h3>💸 Quick Payment</h3></div>
      <div className="card-body">
        <form onSubmit={handlePayment}>
          <label>Recipient Address</label>
          <input className="input" placeholder="0x..." value={paymentRecipient} onChange={(e) => setPaymentRecipient(e.target.value)} />
          <label>Amount (MYR)</label>
          <input className="input" placeholder="10.00" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button className="btn primary" type="submit" disabled={isLoading} style={{flex: 1}}>{isLoading ? <><Spinner/>Sending</> : '✈️ Send'}</button>
            <button className="btn subtle" type="button" onClick={() => { setPaymentRecipient(''); setPaymentAmount(''); }} style={{flex: 1}}>Clear</button>
          </div>
        </form>
      </div>
    </div>
  );

  const HistorySmall = () => (
    <div className="card">
      <div className="card-head"><h3>📊 Recent Activity</h3></div>
      <div className="card-body" style={{paddingTop:12}}>
        {transactions.length > 0 ? (
          <ul className="tx-list">
            {transactions.slice(0,5).map(tx => (
              <li key={tx.id}>
                <div>
                  <div style={{fontWeight:600, color: '#2d3748'}}>{tx.amount} MYR</div>
                  <div style={{fontSize:12,color:'#718096', marginTop: 4}}>{tx.role === 'sent' ? `To ${truncate(tx.to)}` : `From ${truncate(tx.from)}`}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:13, color: tx.role === 'sent' ? '#ef4444' : '#047857', fontWeight: 600}}>{tx.role === 'sent' ? 'Sent' : 'Received'}</div>
                  <div style={{fontSize:12, marginTop:6}} className={tx.status === 'Completed' ? 'status success' : 'status warn'}>{tx.status === 'Completed' ? '✅' : '⚠️'} {tx.status}</div>
                  <div style={{fontSize:11,color:'#a0aec0', marginTop: 4}}>{tx.timestamp}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{color:'#718096', textAlign: 'center', padding: 12}}>No recent transactions</p>
        )}
        <div style={{textAlign:'right',marginTop:12}}>
          <button className="btn subtle" onClick={() => setView('history')}>View all →</button>
        </div>
      </div>
    </div>
  );

  const PaymentView = () => (
    <div className="card">
      <div className="card-head"><h2>💳 Make a Payment</h2></div>
      <div className="card-body">
        <form onSubmit={handlePayment}>
          <label>Recipient Address</label>
          <input className="input" type="text" value={paymentRecipient} onChange={(e) => setPaymentRecipient(e.target.value)} placeholder="0x..." required />
          <label>Amount (MYR)</label>
          <input className="input" type="text" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="10.00" required />
          <div style={{display:'flex',gap:10,marginTop:18}}>
            <button className="btn primary" type="submit" disabled={isLoading} style={{flex: 1}}>{isLoading ? <><Spinner/>Processing</> : '✈️ Send Payment'}</button>
            <button className="btn subtle" type="button" onClick={() => { setPaymentRecipient(''); setPaymentAmount(''); }} style={{flex: 1}}>Reset</button>
          </div>
        </form>
      </div>
    </div>
  );

  const HistoryView = () => (
    <div className="card">
      <div className="card-head"><h2>📋 Transaction History</h2></div>
      <div className="card-body">
        {transactions.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th><th>Counterparty</th><th>Amount</th><th>Role</th><th>Status</th><th>Time</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id}>
                    <td>#{tx.id}</td>
                    <td title={tx.counterparty}>{truncate(tx.counterparty)}</td>
                    <td><strong>{tx.amount} MYR</strong></td>
                    <td style={{fontSize:13,fontWeight:600, color: tx.role === 'sent' ? '#ef4444' : '#047857'}}>{tx.role === 'sent' ? 'Sent' : 'Received'}</td>
                    <td className={tx.status === 'Completed' ? 'status success' : 'status warn'}>{tx.status === 'Completed' ? '✅' : '⚠️'} {tx.status}</td>
                    <td style={{whiteSpace:'nowrap',fontSize:12,color:'#718096'}}>{tx.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p style={{textAlign: 'center', color: '#718096', padding: 20}}>No transactions recorded yet.</p>}
      </div>
    </div>
  );

  const AdminView = () => (
    <div className="card danger">
      <div className="card-head"><h2>⚙️ Admin Panel</h2></div>
      <div className="card-body">
        <p style={{color: '#718096', marginBottom: 16}}>Manage user accounts and fraud detection settings.</p>
        <form onSubmit={handleSetUserStatus}>
          <label>User Address</label>
          <input className="input" type="text" value={adminAddress} onChange={(e) => setAdminAddress(e.target.value)} placeholder="0x..." required />
          <label>Set User Status</label>
          <select className="input" value={adminStatus} onChange={(e) => setAdminStatus(Number(e.target.value))}>
            <option value={1}>✅ Active</option>
            <option value={2}>🚫 Suspended</option>
          </select>
          <div style={{display:'flex',gap:10,marginTop:18}}>
            <button className="btn danger" type="submit" disabled={isLoading} style={{flex: 1}}>{isLoading ? <><Spinner/>Processing</> : '🔧 Update Status'}</button>
            <button className="btn subtle" type="button" onClick={() => setAdminAddress('')} style={{flex: 1}}>Clear</button>
          </div>
        </form>
      </div>
    </div>
  );

  const RegisterView = () => (
    <div style={{maxWidth:600, margin: '0 auto'}}>
      <div className="card">
        <div className="card-head"><h2>👤 Register to Use Payments</h2></div>
        <div className="card-body">
          <p style={{color:'#718096', lineHeight: 1.6}}>
            Create your user profile on-chain so you can send and receive payments securely with anti-fraud protection.
          </p>
          <form onSubmit={handleRegister}>
            <label>Your Name</label>
            <input className="input" value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="Enter your name" required />
            <div style={{display:'flex',gap:10,marginTop:18}}>
              <button className="btn primary" type="submit" disabled={isLoading} style={{flex: 1}}>{isLoading ? <><Spinner/>Registering</> : '✔️ Register'}</button>
              <button className="btn subtle" type="button" onClick={() => setRegisterName('')} style={{flex: 1}}>Clear</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  const ConnectWalletView = () => (
    <div style={{textAlign: 'center', marginTop: '80px', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
      <div className="card" style={{display:'inline-block',textAlign:'left', maxWidth: 480}}>
        <div className="card-head"><h2>🔐 Welcome to Anti-Fraud dApp</h2></div>
        <div className="card-body" style={{textAlign:'center'}}>
          <p style={{color:'#718096', fontSize: 15, lineHeight: 1.6}}>
            Connect your Ethereum wallet to get started with secure, fraud-protected payments.
          </p>
          <button onClick={connectWallet} className="btn primary" style={{padding:'14px 32px', marginTop: 12, fontSize: 15}} disabled={isLoading}>
            {isLoading ? <><Spinner/>Connecting</> : '🔗 Connect Wallet'}
          </button>
          <p style={{color:'#a0aec0', fontSize: 13, marginTop: 20}}>
            Make sure you have MetaMask or another Web3 wallet installed
          </p>
        </div>
      </div>
    </div>
  );

  // --- Main Render ---
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', minHeight:'100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', position: 'relative' }}>
      <style>{`
        /* Layout */
        .app-wrap { display:flex; min-height:100vh; }
        .sidebar {
          width: 280px;
          background: linear-gradient(180deg, #1a202c 0%, #2d3748 100%);
          color: #fff;
          padding: 24px 20px;
          position: fixed;
          height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-sizing: border-box;
          box-shadow: 4px 0 12px rgba(0,0,0,0.15);
        }
        .sidebar h1 { 
          font-size:1.5rem; 
          margin:0 0 28px 0; 
          letter-spacing:0.5px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          font-weight: 700;
        }
        .sidebar-menu { list-style:none;padding:0;margin:0; flex: 1 1 auto; overflow:auto; }
        .sidebar-menu li { 
          padding:14px 12px; 
          border-radius:10px; 
          margin-bottom:8px; 
          cursor:pointer; 
          color:#cbd5e0; 
          display:flex; 
          justify-content:space-between; 
          align-items:center;
          transition: all 0.3s ease;
          font-weight: 500;
        }
        .sidebar-menu li.active { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color:#fff;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        .sidebar-menu li:hover { 
          background:rgba(102, 126, 234, 0.15); 
          color:#fff;
          transform: translateX(4px);
        }
        .sidebar-footer { margin-top:16px; }
        .disconnect-btn { 
          width:100%; 
          padding:12px; 
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color:#fff; 
          border:none; 
          border-radius:10px; 
          cursor:pointer;
          font-weight: 600;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(245, 87, 108, 0.3);
        }
        .disconnect-btn:hover { 
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(245, 87, 108, 0.4);
        }
        .main { margin-left:300px; padding:28px; max-width:1400px; width: calc(100% - 300px); }

        /* Topbar */
        .topbar { 
          display:flex; 
          justify-content:space-between; 
          align-items:center; 
          margin-bottom:24px; 
          gap:16px;
          background: rgba(255,255,255,0.95);
          padding: 16px 20px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
          backdrop-filter: blur(10px);
        }
        .topbar .left { display:flex; align-items:center; gap:16px; }
        .network-badge { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color:#fff; 
          padding:8px 14px; 
          border-radius:999px; 
          font-size:13px;
          font-weight: 600;
        }
        .account-summary { 
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          padding:12px 16px; 
          border-radius:10px; 
          display:flex; 
          gap:16px; 
          align-items:center; 
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }

        /* Cards, inputs, buttons */
        .card { 
          background:#fff; 
          border-radius:12px; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          padding:20px; 
          margin-bottom:20px;
          transition: all 0.3s ease;
          border: 1px solid rgba(255,255,255,0.5);
        }
        .card:hover {
          box-shadow: 0 15px 40px rgba(0,0,0,0.15);
          transform: translateY(-4px);
        }
        .card.headless { padding:0; box-shadow:none; background:transparent; }
        .card-head { 
          display:flex; 
          justify-content:space-between; 
          align-items:center; 
          margin-bottom:16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #f0f1f3;
        }
        .card-head h2 { 
          margin:0;
          color: #1a202c;
          font-size: 1.5rem;
        }
        .card-head h3 { 
          margin:0;
          color: #2d3748;
          font-size: 1.1rem;
        }
        .card-body { padding-top:8px; }
        .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
        .input { 
          width:100%; 
          padding:12px 14px; 
          border-radius:10px; 
          border:2px solid #e2e8f0;
          margin-top:8px; 
          box-sizing:border-box;
          font-size: 14px;
          transition: all 0.3s ease;
          font-family: inherit;
        }
        .input:focus {
          outline: none;
          border-color: #667eea;
          background: linear-gradient(135deg, #f5f7ff 0%, #ede9fe 100%);
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        label { 
          font-size:13px; 
          color:#4a5568; 
          margin-top:12px; 
          display:block;
          font-weight: 600;
        }

        .btn { 
          padding:11px 18px; 
          border-radius:10px; 
          border:none; 
          cursor:pointer;
          transition: all 0.3s ease;
          font-weight: 600;
          font-size: 14px;
        }
        .btn.primary { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color:#fff;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }
        .btn.primary:hover { 
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }
        .btn.primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        .btn.subtle { 
          background:#f7fafc; 
          border:1.5px solid #cbd5e0; 
          color:#2d3748;
          transition: all 0.3s ease;
        }
        .btn.subtle:hover {
          background: #edf2f7;
          border-color: #667eea;
          color: #667eea;
        }
        .btn.small { padding:8px 12px; font-size:13px; }
        .btn.danger { 
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color:white;
          box-shadow: 0 4px 15px rgba(245, 87, 108, 0.3);
        }
        .btn.danger:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(245, 87, 108, 0.4);
        }
        .btn.transparent { background:transparent; color:#1f2a44; }

        .account-box { 
          display:flex; 
          justify-content:space-between; 
          align-items:center; 
          gap:16px; 
          padding:14px; 
          border:1.5px solid #e2e8f0; 
          border-radius:12px; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        }

        /* Table */
        .table-wrap { overflow:auto; }
        .table { 
          width:100%; 
          border-collapse:collapse;
          font-size: 14px;
        }
        .table thead {
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        }
        .table th, .table td { 
          padding:14px 12px; 
          border-bottom:1px solid #e2e8f0; 
          text-align:left;
        }
        .table th {
          font-weight: 600;
          color: #2d3748;
        }
        .table tr:hover {
          background: #f7fafc;
        }
        .tx-list { 
          list-style:none; 
          padding:0; 
          margin:0; 
          display:flex; 
          flex-direction:column; 
          gap:10px;
        }
        .tx-list li { 
          display:flex; 
          justify-content:space-between; 
          align-items:center; 
          padding:12px; 
          border-radius:10px; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border:1.5px solid #e2e8f0;
          transition: all 0.3s ease;
        }
        .tx-list li:hover {
          border-color: #667eea;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
        }

        .status { 
          padding:8px 12px; 
          border-radius:8px; 
          font-weight:600; 
          text-align:center;
          font-size: 13px;
        }
        .status.success { 
          background: linear-gradient(135deg, #d4fc79 0%, #96f097 100%);
          color: #065f46;
        }
        .status.warn { 
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
          color: #78350f;
        }

        /* responsive */
        @media (max-width:1024px) {
          .sidebar { width: 250px; }
          .main { margin-left:270px; width: calc(100% - 270px); padding: 20px; }
          .grid-2 { grid-template-columns:1fr; }
        }

        @media (max-width:768px) {
          .sidebar { display:none; }
          .main { margin-left:0; width: 100%; padding:16px; }
          .grid-2 { grid-template-columns:1fr; }
          .topbar { flex-direction: column; }
          .topbar .left { width: 100%; }
        }

        /* toast */
        .toast { 
          position:fixed; 
          right:20px; 
          top:20px; 
          background:#2d3748; 
          color:#fff; 
          padding:14px 18px; 
          border-radius:10px; 
          box-shadow: 0 12px 36px rgba(0,0,0,0.3);
          z-index:4000;
          font-weight: 500;
          animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .toast.success { 
          background: linear-gradient(135deg, #0ea5a6 0%, #047857 100%);
        }
        .toast.error { 
          background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
        }
        .toast.info { 
          background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%);
        }
      `}</style>

      <div className="app-wrap">
        {/* Sidebar (hidden on small screens) */}
        {account && (
          <aside className="sidebar" role="navigation">
            <h1>Anti-Fraud dApp</h1>
            <ul className="sidebar-menu" aria-hidden={false}>
              <li className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</li>
              <li className={view === 'payment' ? 'active' : ''} onClick={() => setView('payment')}>Make Payment</li>
              <li className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>History</li>
              {isOwner && <li className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>Admin Panel</li>}
            </ul>
            <div className="sidebar-footer">
              <button className="disconnect-btn" onClick={disconnectWallet}>Disconnect</button>
            </div>
          </aside>
        )}

        <main className="main" role="main">
          {/* Topbar */}
          <div className="topbar">
            <div className="left">
              <div className="network-badge">🔗 Ethereum</div>
              <div style={{fontSize:20,fontWeight:700, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>🔐 Anti-Fraud dApp</div>
            </div>

            <div style={{display:'flex',gap:14,alignItems:'center'}}>
              {!account ? (
                <button className="btn primary" onClick={connectWallet} disabled={isLoading}>{isLoading ? 'Connecting...' : '🔗 Connect Wallet'}</button>
              ) : (
                <div className="account-summary">
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:13,color:'#718096', fontWeight: 500}}>Balance</div>
                    <div style={{fontWeight:700, fontSize: 16}}>{userBalance} MYR</div>
                  </div>
                  <div style={{width:1,background:'#cbd5e0',height:40}}/>
                  <div style={{textAlign:'left'}}>
                    <div style={{fontSize:13,color:'#718096', fontWeight: 500}}>Account</div>
                    <div style={{display:'flex',gap:10,alignItems:'center'}}>
                      <div style={{fontWeight:700, color: '#2d3748'}}>{truncate(account)}</div>
                      <button className="btn small subtle" onClick={() => copyToClipboard(account)}>Copy</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main content */}
          {!account ? (
            <ConnectWalletView />
          ) : !userName ? (
            <RegisterView />
          ) : (
            <div>
              {view === 'dashboard' && <DashboardView />}
              {view === 'payment' && <PaymentView />}
              {view === 'history' && <HistoryView />}
              {isOwner && view === 'admin' && <AdminView />}
            </div>
          )}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type || 'info'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
// ...existing code...