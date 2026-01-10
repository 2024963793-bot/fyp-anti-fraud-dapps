import { expect } from "chai";
import hre from "hardhat"; // Use this import style
const { ethers } = hre;   // And destructure ethers from hre

describe("AntiFraudSystem", function () {
  let antiFraudSystem, owner, user1;

  // This runs before each test, deploying a fresh contract every time
  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    // We need to provide initial values for the constructor arguments
    const initialMaxTx = ethers.parseEther("100"); // 100 ETH
    const initialMinTime = 60; // 60 seconds

    const AntiFraudSystem = await ethers.getContractFactory("AntiFraudSystem");
    antiFraudSystem = await AntiFraudSystem.deploy(initialMaxTx, initialMinTime);
  });

  // Test case 1: It should deploy the contract and set the owner
  it("Should set the right owner", async function () {
    expect(await antiFraudSystem.owner()).to.equal(owner.address);
  });

  // Test case 2: It should allow a new user to register
  it("Should allow a new user to register", async function () {
    // user1 calls the registerUser function
    await antiFraudSystem.connect(user1).registerUser("Alice");

    // Check if the user's status is now Active
    const user = await antiFraudSystem.users(user1.address);
    expect(user.status).to.equal(1); // In our enum, Active is 1
    expect(user.name).to.equal("Alice");
  });
});

