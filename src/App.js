import React from "react";
import Web3 from "web3";
import "./App.css";
import Basic from "./Basic.json";
import RenJS from "@renproject/ren";

// Replace with your contract's address.
const contractAddress = "0x136C0a6Cf40887c2CBCB5b0A45CECA0e674Ce435";

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      balance: 0,
      message: "",
      error: "",
      renJS: new RenJS("testnet"),
      earn: {
        loading: false,
        error: "",
        data: null,
      },
    };
  }

  componentDidMount = async () => {
    let web3Provider;
    // Initialize web3 (https://medium.com/coinmonks/web3-js-ethereum-javascript-api-72f7b22e2f0a)
    // Modern dApp browsers...
    if (window.ethereum) {
      web3Provider = window.ethereum;
      try {
        // Request account access
        await window.ethereum.enable();
      } catch (error) {
        // User denied account access...
        this.logError("Please allow access to your Web3 wallet.");
        return;
      }
    }
    // Legacy dApp browsers...
    else if (window.web3) {
      web3Provider = window.web3.currentProvider;
    }
    // If no injected web3 instance is detected, fall back to Ganache
    else {
      this.logError("Please install MetaMask!");
      return;
    }
    const web3 = new Web3(web3Provider);
    const networkID = await web3.eth.net.getId();
    if (networkID !== 42) {
      this.logError("Please set your network to Kovan.");
      return;
    }
    this.setState({ web3 }, () => {
      // Update balances immediately and every 10 seconds
      this.updateBalance();
      setInterval(() => {
        this.updateBalance();
      }, 10 * 1000);
    });
  };

  render = () => {
    const { balance, message, error } = this.state;
    return (
      <div className="App">
        <p>Balance: {balance} BTC</p>
        <p>
          <button onClick={() => this.deposit().catch(this.logError)}>
            Deposit 0.001 BTC
          </button>
        </p>

        <p>
          <button onClick={() => this.earn().catch(this.logError)}>Earn</button>
        </p>
        <p>
          <button onClick={() => this.withdraw().catch(this.logError)}>
            Withdraw {balance} BTC
          </button>
        </p>
        <p>{message}</p>
        {error ? <p style={{ color: "red" }}>{error}</p> : null}
      </div>
    );
  };

  updateBalance = async () => {
    const { web3 } = this.state;
    const contract = new web3.eth.Contract(Basic.abi, contractAddress);
    const balance = await contract.methods.balance().call();
    this.setState({ balance: parseInt(balance.toString()) / 10 ** 8 });
  };

  earn = async () => {
    this.setState({ earn: { ...this.state.earn, loading: true } });
    const { web3 } = this.state;
    const contract = new web3.eth.Contract(Basic.abi, contractAddress);
    try {
      await contract.methods.earn();
      this.setState({ earn: { ...this.state.earn, data: true } });
    } catch (error) {
      console.log(error);
      this.setState({ earn: { ...this.state.earn, error: error } });
    }
    this.setState({ earn: { ...this.state.earn, loading: false } });
  };

  logError = (error) => {
    console.error(error);
    this.setState({ error: String((error || {}).message || error) });
  };

  log = (message) => {
    this.setState({ message });
  };

  deposit = async () => {
    this.logError("");
    const { web3, renJS } = this.state;
    const amount = 0.001; // BTC
    const mint = renJS.lockAndMint({
      // Send BTC from the Bitcoin blockchain to the Ethereum blockchain.
      sendToken: RenJS.Tokens.BTC.Btc2Eth,

      // The contract we want to interact with
      sendTo: contractAddress,

      // The name of the function we want to call
      contractFn: "deposit",

      nonce: renJS.utils.randomNonce(),

      // Arguments expected for calling `deposit`
      contractParams: [],

      // Web3 provider for submitting mint to Ethereum
      web3Provider: web3.currentProvider,
    });

    const gatewayAddress = await mint.gatewayAddress();
    this.log(`Deposit ${amount} BTC to ${gatewayAddress}`);

    // Wait for the Darknodes to detect the BTC transfer.
    const confirmations = 0;
    const deposit = await mint.wait(confirmations);

    this.log("Submitting to RenVM...");
    const signature = await deposit.submit();

    // Submit the signature to Ethereum and receive zBTC.
    this.log("Submitting to smart contract...");
    await signature.submitToEthereum(web3.currentProvider);
    this.log(`Deposited ${amount} BTC.`);

    // TODO
  };

  withdraw = async () => {
    this.logError("");
    const { web3, renJS, balance } = this.state;

    const amount = balance;
    const recipient = prompt("Enter BTC recipient:");
    const from = (await web3.eth.getAccounts())[0];
    const contract = new web3.eth.Contract(Basic.abi, contractAddress);

    this.log("Calling `withdraw` on smart contract...");
    const ethereumTxHash = await new Promise((resolve, reject) => {
      contract.methods
        .withdraw(
          RenJS.utils.btc.addressToHex(recipient), //_to
          Math.floor(amount * 10 ** 8) // _amount in Satoshis
        )
        .send({ from })
        .on("transactionHash", resolve)
        .catch(reject);
    });

    this.log(`Retrieving burn event from contract...`);
    const burn = await renJS
      .burnAndRelease({
        // Send BTC from the Ethereum blockchain to the Bitcoin blockchain.
        // This is the reverse of shitIn.
        sendToken: RenJS.Tokens.BTC.Eth2Btc,

        // The web3 provider to talk to Ethereum
        web3Provider: web3.currentProvider,

        // The transaction hash of our contract call
        ethereumTxHash,
      })
      .readFromEthereum();

    this.log(`Submitting to Darknodes...`);
    await burn.submit();
    this.log(`Withdrew ${amount} BTC to ${recipient}.`);
    // TODO
  };
}
export default App;
