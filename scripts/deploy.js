    // We require the Hardhat Runtime Environment explicitly here. This is optional
    // but useful for running the script in a standalone fashion through `node <script>`.
    //
    // You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
    // will compile your contracts, add the Hardhat Runtime Environment's members to the
    // global scope, and execute the script.
    import hre from "hardhat";
    const { ethers } = hre;

    async function main() {
      // These are the initial values for the fraud-detection rules in the contract's constructor.
      // We are setting the max transaction amount to 100 ETH and the minimum time between
      // transactions to 60 seconds.
      const initialMaxTxAmount = ethers.parseEther("100"); // 100 ETH
      const initialMinTime = 60; // 60 seconds

      console.log("Deploying AntiFraudSystem contract...");

      // Get the contract factory. This is an abstraction used to deploy new smart contracts,
      // so `AntiFraudSystem` here is a factory for instances of our contract.
      const antiFraudSystem = await ethers.deployContract("AntiFraudSystem", [
        initialMaxTxAmount,
        initialMinTime,
      ]);

      // Wait for the deployment transaction to be mined and confirmed on the blockchain.
      await antiFraudSystem.waitForDeployment();

      // The `target` property on the deployed contract instance is the contract's address.
      console.log(
        `AntiFraudSystem deployed successfully to: ${antiFraudSystem.target}`
      );
    }

    // We recommend this pattern to be able to use async/await everywhere
    // and properly handle errors.
    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
    
