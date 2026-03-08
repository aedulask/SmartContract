import Web3 from "web3";
import AgriconABI from "./AgriconABI.json";
import { CONTRACT_ADDRESS, GANACHE_CHAIN_IDS } from "./config";

const ensureGanacheNetwork = async () => {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });

  if (!GANACHE_CHAIN_IDS.has(chainId)) {
    throw new Error(
      `Wrong network. Select Ganache in MetaMask (current chainId: ${chainId}).`
    );
  }
};

export const loadBlockchain = async () => {

  if (window.ethereum) {

    const web3 = new Web3(window.ethereum);

    // request wallet connection
    await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    await ensureGanacheNetwork();

    const accounts = await web3.eth.getAccounts();
    const account = accounts[0];
    const checksumAddress = web3.utils.toChecksumAddress(CONTRACT_ADDRESS);
    const codeAtAddress = await web3.eth.getCode(checksumAddress);

    if (!codeAtAddress || codeAtAddress === "0x") {
      throw new Error(
        `No contract bytecode found at ${checksumAddress} on current network.`
      );
    }

    const contract = new web3.eth.Contract(
      AgriconABI,
      checksumAddress
    );

    return { web3, account, contract };

  } else {
    alert("Please install MetaMask");
  }
};
