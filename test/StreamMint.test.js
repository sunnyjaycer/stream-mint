const { assert, expect } = require("chai")
const { Framework } = require("@superfluid-finance/sdk-core")
const { ethers } = require("hardhat")
const { deployTestFramework } = require("@superfluid-finance/ethereum-contracts/dev-scripts/deploy-test-framework");
const TestToken = require("@superfluid-finance/ethereum-contracts/build/contracts/TestToken.json")
const hostABI = require("@superfluid-finance/ethereum-contracts/build/contracts/Superfluid.json");

let provider;

let sfDeployer
let contractsFramework

let alice
let bob
let carol
let mainReceiver
let sideReceiver

let sf
let dai
let daix
let streamMint

const thousandEther = ethers.utils.parseEther("10000")

before(async function () {

    // Get accounts from hardhat
    [alice, bob, carol, mainReceiver, sideReceiver] = await ethers.getSigners()
    provider = alice.provider;
    sfDeployer = await deployTestFramework()
    console.log("Alice:", alice.address);
    console.log("Bob:", bob.address);

    ////////// Setting up Superfluid Framework & Super Tokens //////////

    // deploy the framework locally
    contractsFramework = await sfDeployer.frameworkDeployer.getFramework()

    // Initialize the superfluid framework, put custom and web3 only bc we are using hardhat locally
    sf = await Framework.create({
        chainId: 31337,                               //note: this is hardhat's local chainId
        provider,
        resolverAddress: contractsFramework.resolver, // this is how you get the resolver address
        protocolReleaseVersion: "test"
    })

    // DEPLOYING DAI and DAI wrapper super token
    tokenDeployment = await sfDeployer.frameworkDeployer.deployWrapperSuperToken(
        "Fake DAI Token",
        "fDAI",
        18,
        ethers.utils.parseEther("100000000").toString()
    )

    // Use the framework to get the super toen
    daix = await sf.loadSuperToken("fDAIx");
    dai = new ethers.Contract(
        daix.underlyingToken.address,
        TestToken.abi,
        alice
    )

    ////////// Loading Accounts with Tokens //////////

    // minting test DAI
    await dai.connect(alice).mint(alice.address, thousandEther)
    await dai.connect(bob).mint(bob.address, thousandEther)
    await dai.connect(carol).mint(carol.address, thousandEther)
    await dai.connect(mainReceiver).mint(mainReceiver.address, thousandEther)
    await dai.connect(sideReceiver).mint(sideReceiver.address, thousandEther)
    
    // approving DAIx to spend DAI (Super Token object is not an etherscontract object and has different operation syntax)
    await dai.connect(alice).approve(daix.address, ethers.constants.MaxInt256)
    await dai.connect(bob).approve(daix.address, ethers.constants.MaxInt256)
    await dai.connect(carol).approve(daix.address, ethers.constants.MaxInt256)
    await dai.connect(mainReceiver).approve(daix.address, ethers.constants.MaxInt256)
    await dai.connect(sideReceiver).approve(daix.address, ethers.constants.MaxInt256)

    // Upgrading all DAI to DAIx
    const upgradeOp = daix.upgrade({ amount: thousandEther })
    
    await upgradeOp.exec(alice)
    await upgradeOp.exec(bob)
    await upgradeOp.exec(carol)
    await upgradeOp.exec(mainReceiver)
    await upgradeOp.exec(sideReceiver)

    const daixBal = await daix.balanceOf({
        account: alice.address,
        providerOrSigner: alice
    })

    console.log("DAIx balance for each account:", daixBal)

    ////////// Deploying StreamMint //////////

    let StreamMint = await ethers.getContractFactory("StreamMint", alice)

    streamMint = await StreamMint.deploy(
      daix.address,
      1000,
      sf.settings.config.hostAddress
    );

    console.log("StreamMint:", streamMint.address);

});


describe("sending flows", async function () {

    it("Check Token URI", async () => {

      assert.equal(await streamMint.tokenURI("2"), "ipfs://QmPH2Nc9R1v3AXZmTB16WU1CsXmuKFEKvS6EwBhEnybCni", "Alice wasn't minted an NFT");

    })

    it("Case #1 - Alice sends an sufficient flow, gets NFT", async () => {

      const createFlowOperation = daix.createFlow({
          receiver: streamMint.address,
          flowRate: "1000"
      })

      await (await createFlowOperation.exec(alice)).wait();

      assert.equal(await streamMint.nftOwned(alice.address), 1, "Alice wasn't minted an NFT");
      assert.equal(await streamMint.ownerOf(1), alice.address, "Alice wasn't minted an NFT");

    });

    it("Case #2 - Alice deletes flow, loses NFT", async () => {

      const deleteFlowOperation = daix.deleteFlow({
          sender: alice.address,
          receiver: streamMint.address,
      });

      await (await deleteFlowOperation.exec(alice)).wait();

      try {
        // Call the view function that is expected to revert
        await streamMint.ownerOf(1);

        // If the function call does not revert, the test should fail
        await expect.fail("unexpected success");
        
      } catch (error) {

        // Handle the error and assert that it is a revert
        await expect(error.message).to.contain("revert");

      }

    });

    it("Case #3 - Alice sends a insufficient flow", async () => {

        const createFlowOperation = daix.createFlow({
            receiver: streamMint.address,
            flowRate: "500"
        })

        await (await createFlowOperation.exec(alice)).wait();

        try {
          
          // Call the view function that is expected to revert
          await streamMint.ownerOf(1);

          // If the function call does not revert, the test should fail
          await expect.fail("unexpected success");
          
        } catch (error) {

          // Handle the error and assert that it is a revert
          await expect(error.message).to.contain("revert");

        }

    });

    it("Case #4 - Alice increases flow across threshold", async () => {

      const updateFlowOperation = daix.updateFlow({
          receiver: streamMint.address,
          flowRate: "1500"
      })

      await (await updateFlowOperation.exec(alice)).wait();

      assert.equal(await streamMint.nftOwned(alice.address), 2, "Alice wasn't minted an NFT");
      assert.equal(await streamMint.ownerOf(2), alice.address, "Alice wasn't minted an NFT");

    });

    it("Case #5 - Alice decreases flow across threshold, loses NFT", async () => {

      const updateFlowOperation = daix.updateFlow({
          receiver: streamMint.address,
          flowRate: "500"
      })

      await (await updateFlowOperation.exec(alice)).wait();

      assert.equal(await streamMint.nftOwned(alice.address), 0, "Alice still marked as holding NFT");

      try {
        // Call the view function that is expected to revert
        await streamMint.ownerOf(2);

        // If the function call does not revert, the test should fail
        await expect.fail("unexpected success");
        
      } catch (error) {

        // Handle the error and assert that it is a revert
        await expect(error.message).to.contain("revert");

      }

    });

    it("Case #6 - Alice deletes flow", async () => {

      const createFlowOperation = daix.deleteFlow({
          sender: alice.address,
          receiver: streamMint.address
      })

      await (await createFlowOperation.exec(alice)).wait();

      try {
        // Call the view function that is expected to revert
        await streamMint.ownerOf(2);

        // If the function call does not revert, the test should fail
        await expect.fail("unexpected success");
        
      } catch (error) {

        // Handle the error and assert that it is a revert
        await expect(error.message).to.contain("revert");

      }

    })

})