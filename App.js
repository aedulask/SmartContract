import React, { useCallback, useEffect, useState } from "react";
import Web3 from "web3";
import AgriconABI from "./AgriconABI.json";
import { CONTRACT_ADDRESS, GANACHE_CHAIN_IDS } from "./config";
import "bootstrap/dist/css/bootstrap.min.css";
import "./dashbaord.css";

const GLOBAL_CONTRACT_STORAGE_KEY = "agricon_contract_address";
const chainContractStorageKey = (id) => `agricon_contract_address_${id}`;
const CONTRACT_STATUS_LABELS = ["Created", "Accepted", "Delivered", "Completed"];

function App() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [web3, setWeb3] = useState(null);
  const [contract, setContract] = useState(null);
  const [loadedContractAddress, setLoadedContractAddress] = useState("");
  const [status, setStatus] = useState("Connecting wallet...");
  const [error, setError] = useState("");
  const [contractAddressInput, setContractAddressInput] = useState(
    () => CONTRACT_ADDRESS || localStorage.getItem(GLOBAL_CONTRACT_STORAGE_KEY) || ""
  );

  const [farmer, setFarmer] = useState("");
  const [crop, setCrop] = useState("");
  const [quantity, setQuantity] = useState("");
  const [priceEth, setPriceEth] = useState("");

  const [contractId, setContractId] = useState("");
  const [advanceEth, setAdvanceEth] = useState("0.1");
  const [finalEth, setFinalEth] = useState("0.9");
  const [lookupId, setLookupId] = useState("1");
  const [lookupResult, setLookupResult] = useState(null);
  const [opsChecklist, setOpsChecklist] = useState({
    walletReady: false,
    contractReady: false,
    farmerLoaded: false,
    paymentPlanSet: false
  });

  const initBlockchain = useCallback(async () => {
    let web3Instance = null;
    try {
      if (!window.ethereum) {
        throw new Error("MetaMask not found. Install extension and refresh.");
      }

      web3Instance = new Web3(window.ethereum);
      setWeb3(web3Instance);

      const currentChainId = await window.ethereum.request({
        method: "eth_chainId"
      });
      setChainId(currentChainId);

      const existingAccounts = await window.ethereum.request({
        method: "eth_accounts"
      });
      const accounts =
        existingAccounts && existingAccounts.length
          ? existingAccounts
          : await window.ethereum.request({ method: "eth_requestAccounts" });
      const active = accounts?.[0];
      setAccount(active || "");

      if (!GANACHE_CHAIN_IDS.has(currentChainId)) {
        throw new Error(
          `Wrong network (${currentChainId}). Switch MetaMask to Ganache/Local network (1337, 5777, or 31337).`
        );
      }

      if (!active) {
        throw new Error("No wallet account connected.");
      }

      setError("");
      const chainAddress =
        localStorage.getItem(chainContractStorageKey(currentChainId)) || "";
      const preferredAddress = (chainAddress || contractAddressInput || "").trim();

      if (!preferredAddress) {
        setContract(null);
        setLoadedContractAddress("");
        setStatus("Wallet connected. Enter deployed contract address.");
        return;
      }

      setContractAddressInput(preferredAddress);
      setStatus("Wallet connected. Loading contract...");
      await loadContractInstance(web3Instance, preferredAddress, currentChainId);
    } catch (e) {
      setError(e.message || "Initialization failed.");
      setStatus("Connection failed.");
      setContract(null);
      if (!web3Instance) {
        setWeb3(null);
      }
    }
  }, [contractAddressInput]);

  useEffect(() => {
    initBlockchain();

    if (!window.ethereum) {
      return undefined;
    }

    const handleAccountsChanged = async (accounts) => {
      setAccount(accounts?.[0] || "");
      setStatus("Account changed.");
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [initBlockchain]);

  async function loadContractInstance(web3Instance, rawAddress, chainIdHint = "") {
    const targetAddress = (rawAddress || "").trim();
    if (!targetAddress) {
      setContract(null);
      setLoadedContractAddress("");
      throw new Error("Enter a contract address.");
    }

    if (!web3Instance.utils.isAddress(targetAddress)) {
      setContract(null);
      setLoadedContractAddress("");
      throw new Error("Invalid contract address format.");
    }

    const checksumAddress = web3Instance.utils.toChecksumAddress(targetAddress);
    const activeChainId =
      chainIdHint ||
      (await window.ethereum.request({
        method: "eth_chainId"
      }));
    if (!GANACHE_CHAIN_IDS.has(activeChainId)) {
      setContract(null);
      setLoadedContractAddress("");
      throw new Error(
        `Wrong network (${activeChainId}). Switch MetaMask to Ganache/Local network (1337, 5777, or 31337).`
      );
    }
    const code = await web3Instance.eth.getCode(checksumAddress);
    if (!code || code === "0x") {
      setContract(null);
      setLoadedContractAddress("");
      throw new Error(
        `No contract deployed at ${checksumAddress} on network ${activeChainId}. Redeploy and use the latest address.`
      );
    }

    const agricon = new web3Instance.eth.Contract(AgriconABI, checksumAddress);
    if (typeof agricon.methods.createContract !== "function") {
      setContract(null);
      setLoadedContractAddress("");
      throw new Error("ABI mismatch: createContract function not found.");
    }

    setContract(agricon);
    setLoadedContractAddress(checksumAddress);
    localStorage.setItem(GLOBAL_CONTRACT_STORAGE_KEY, checksumAddress);
    localStorage.setItem(chainContractStorageKey(activeChainId), checksumAddress);
    setStatus("Wallet and contract connected.");
    setError("");
  }

  async function handleLoadContractAddress() {
    try {
      if (!web3) {
        throw new Error("Connect wallet first.");
      }
      if (!chainId) {
        throw new Error("Chain ID not detected yet.");
      }
      if (!GANACHE_CHAIN_IDS.has(chainId)) {
        throw new Error(
          `Wrong network (${chainId}). Switch MetaMask to Ganache/Local network (1337, 5777, or 31337).`
        );
      }
      setStatus("Validating contract address...");
      await loadContractInstance(web3, contractAddressInput, chainId);
    } catch (e) {
      setError(e.message || "Unable to load contract.");
      setStatus("Contract load failed.");
    }
  }

  const requireReady = () => {
    if (!web3 || !contract || !account) {
      throw new Error("Wallet/contract not ready. Fix connection first.");
    }
  };

  const parseId = () => {
    const id = Number(contractId);
    if (!Number.isInteger(id) || id < 1) {
      throw new Error("Contract ID must be a positive integer.");
    }
    return id;
  };

  const statusTone = error ? "danger" : "info";
  const shortAddress = (value) =>
    value && value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
  const connected = Boolean(account && web3);
  const contractReady = Boolean(contract && loadedContractAddress);
  const workflowSteps = ["Created", "Accepted", "Delivered", "Completed"];
  const workflowIndex = lookupResult ? workflowSteps.indexOf(lookupResult.status) : -1;
  const networkName =
    chainId === "0x539"
      ? "Ganache 1337"
      : chainId === "0x1691"
        ? "Ganache 5777"
        : chainId === "0x7a69"
          ? "Local 31337"
          : "Unknown";
  const checklistDoneCount = Object.values(opsChecklist).filter(Boolean).length;
  const checklistProgress = Math.round((checklistDoneCount / 4) * 100);
  const toggleChecklist = (key) =>
    setOpsChecklist((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));

  async function lookupContractById() {
    try {
      requireReady();
      const id = Number(lookupId);
      if (!Number.isInteger(id) || id < 1) {
        throw new Error("Lookup ID must be a positive integer.");
      }

      const details = await contract.methods.contracts(id).call();
      if (!details || Number(details.id) === 0) {
        throw new Error(`Contract ${id} not found.`);
      }

      const statusIndex = Number(details.status);
      setLookupResult({
        id: Number(details.id),
        farmer: details.farmer,
        buyer: details.buyer,
        cropName: details.cropName,
        quantity: Number(details.quantity),
        priceEth: web3.utils.fromWei(details.price, "ether"),
        advanceEth: web3.utils.fromWei(details.advancePaid, "ether"),
        status: CONTRACT_STATUS_LABELS[statusIndex] || `Unknown (${statusIndex})`
      });
      setStatus(`Loaded contract #${id}.`);
      setError("");
    } catch (e) {
      setLookupResult(null);
      setError(e.message || "Unable to fetch contract by ID.");
      setStatus("Contract lookup failed.");
    }
  }

  async function createContract() {
    try {
      requireReady();

      if (!web3.utils.isAddress(farmer)) {
        throw new Error("Farmer wallet address is invalid.");
      }

      const qty = Number(quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new Error("Quantity must be a positive integer.");
      }

      const priceWei = web3.utils.toWei(priceEth || "0", "ether");
      setStatus("Submitting createContract transaction...");

      await contract.methods
        .createContract(farmer.trim(), crop.trim(), qty, priceWei)
        .send({ from: account });

      setStatus("Contract created successfully.");
    } catch (e) {
      setError(e.message || "createContract failed.");
    }
  }

  async function acceptContract() {
    try {
      requireReady();
      const id = parseId();
      setStatus("Submitting acceptContract transaction...");

      await contract.methods.acceptContract(id).send({ from: account });
      setStatus("Contract accepted successfully.");
    } catch (e) {
      setError(e.message || "acceptContract failed.");
    }
  }

  async function payAdvance() {
    try {
      requireReady();
      const id = parseId();
      const value = web3.utils.toWei(advanceEth || "0", "ether");
      setStatus("Submitting payAdvance transaction...");

      await contract.methods.payAdvance(id).send({ from: account, value });
      setStatus("Advance paid successfully.");
    } catch (e) {
      setError(e.message || "payAdvance failed.");
    }
  }

  async function markDelivered() {
    try {
      requireReady();
      const id = parseId();
      setStatus("Submitting markDelivered transaction...");

      await contract.methods.markDelivered(id).send({ from: account });
      setStatus("Delivery marked successfully.");
    } catch (e) {
      setError(e.message || "markDelivered failed.");
    }
  }

  async function releasePayment() {
    try {
      requireReady();
      const id = parseId();
      const value = web3.utils.toWei(finalEth || "0", "ether");
      setStatus("Submitting releasePayment transaction...");

      await contract.methods.releasePayment(id).send({ from: account, value });
      setStatus("Final payment released successfully.");
    } catch (e) {
      setError(e.message || "releasePayment failed.");
    }
  }

  return (
    <div className="dashboard-shell">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="container py-4 py-lg-5">
        <section className="top-nav mb-3">
          <div className="brand-dot" />
          <div>
            <p className="eyebrow mb-1">AGRICON</p>
            <strong>Blockchain Contract Farming</strong>
          </div>
          <span className={`network-pill ${GANACHE_CHAIN_IDS.has(chainId) ? "ok" : "warn"}`}>
            {networkName}
          </span>
        </section>

        <section className="hero-panel mb-3">
          <div className="hero-copy">
            <h1 className="hero-title mb-2">Professional Contract Operations Dashboard</h1>
            <p className="hero-subtitle mb-3">
              Production-style cockpit for wallet connection, contract lifecycle management,
              and audit-friendly state verification.
            </p>
            <div className="hero-stats">
              <div className="metric-chip">
                <span>Wallet</span>
                <strong>{shortAddress(account) || "Not connected"}</strong>
              </div>
              <div className="metric-chip">
                <span>Contract</span>
                <strong>{shortAddress(loadedContractAddress) || "Not loaded"}</strong>
              </div>
              <div className="metric-chip">
                <span>Chain</span>
                <strong>{chainId || "Unknown"}</strong>
              </div>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-ring hero-ring-1" />
            <div className="hero-ring hero-ring-2" />
            <div className="hero-core">AgriChain</div>
          </div>
        </section>

        <div className={`status-banner ${statusTone}`}>{error || status}</div>

        <section className="accent-strip mt-3">
          <article className="accent-card ac-blue">
            <h5>Smart Ops</h5>
            <p>Role-based on-chain lifecycle execution.</p>
          </article>
          <article className="accent-card ac-green">
            <h5>Audit Ready</h5>
            <p>Inspect state and validate payment milestones.</p>
          </article>
          <article className="accent-card ac-orange">
            <h5>Demo Mode</h5>
            <p>Ganache + MetaMask workflow optimized for review.</p>
          </article>
        </section>

        <div className="kpi-grid mt-3">
          <article className="kpi-card">
            <p>Wallet Session</p>
            <h4>{connected ? "Connected" : "Disconnected"}</h4>
          </article>
          <article className="kpi-card">
            <p>Contract State</p>
            <h4>{contractReady ? "Operational" : "Setup Needed"}</h4>
          </article>
          <article className="kpi-card">
            <p>Tracked Contract</p>
            <h4>{lookupResult ? `#${lookupResult.id}` : "None"}</h4>
          </article>
          <article className="kpi-card">
            <p>Current Status</p>
            <h4>{lookupResult?.status || "Not selected"}</h4>
          </article>
        </div>

        <div className="workspace-grid mt-3">
          <div className="left-col">
            <section className="panel-card">
              <h3>Contract Connection</h3>
              <p className="panel-note">
                Load the active deployment address for this Ganache network.
              </p>
              <input
                className="form-control mb-3"
                placeholder="Deployed Contract Address (0x...)"
                value={contractAddressInput}
                onChange={(e) => setContractAddressInput(e.target.value)}
              />
              <button className="btn btn-dashboard btn-soft" onClick={handleLoadContractAddress}>
                Load Contract Address
              </button>
            </section>

            <section className="panel-card">
              <h3>Create Farming Contract</h3>
              <p className="panel-note">
                Use buyer wallet as sender and provide a valid farmer wallet address.
              </p>
              <input
                className="form-control mb-2"
                placeholder="Farmer Address (0x...)"
                value={farmer}
                onChange={(e) => setFarmer(e.target.value)}
              />
              <input
                className="form-control mb-2"
                placeholder="Crop Name"
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
              />
              <input
                className="form-control mb-2"
                placeholder="Quantity (integer)"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <input
                className="form-control mb-3"
                placeholder="Total Price (ETH)"
                value={priceEth}
                onChange={(e) => setPriceEth(e.target.value)}
              />
              <button className="btn btn-dashboard btn-primary-fill" onClick={createContract}>
                Create Contract
              </button>
            </section>

            <section className="panel-card">
              <h3>Lifecycle Actions</h3>
              <p className="panel-note">
                Execute steps in order: Accept -> Advance -> Delivered -> Final Payment.
              </p>
              <input
                className="form-control mb-2"
                placeholder="Contract ID"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
              />
              <input
                className="form-control mb-2"
                placeholder="Advance Amount (ETH)"
                value={advanceEth}
                onChange={(e) => setAdvanceEth(e.target.value)}
              />
              <input
                className="form-control mb-3"
                placeholder="Final Payment Amount (ETH)"
                value={finalEth}
                onChange={(e) => setFinalEth(e.target.value)}
              />
              <div className="action-grid">
                <button className="btn btn-dashboard btn-primary-fill" onClick={acceptContract}>
                  Accept Contract
                </button>
                <button className="btn btn-dashboard btn-primary-fill" onClick={payAdvance}>
                  Pay Advance
                </button>
                <button className="btn btn-dashboard btn-primary-fill" onClick={markDelivered}>
                  Mark Delivered
                </button>
                <button className="btn btn-dashboard btn-primary-fill" onClick={releasePayment}>
                  Release Payment
                </button>
              </div>
            </section>
          </div>

          <div className="right-col">
            <section className="panel-card">
              <h3>Workflow Timeline</h3>
              <p className="panel-note">Realtime progress for the selected contract.</p>
              <div className="timeline-wrap">
                {workflowSteps.map((step, index) => (
                  <div
                    key={step}
                    className={`timeline-step ${workflowIndex >= index ? "active" : ""}`}
                  >
                    <div className="timeline-dot">{index + 1}</div>
                    <div>
                      <strong>{step}</strong>
                      <p className="mb-0">
                        {index === 0 && "Buyer creates contract."}
                        {index === 1 && "Farmer accepts agreement."}
                        {index === 2 && "Farmer marks crop delivered."}
                        {index === 3 && "Buyer releases remaining ETH."}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel-card">
              <h3>Contract Inspector</h3>
              <p className="panel-note">Fetch contract state details by ID for demos and QA.</p>
              <div className="d-flex gap-2 mb-3">
                <input
                  className="form-control"
                  placeholder="Lookup Contract ID"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                />
                <button className="btn btn-dashboard btn-soft" onClick={lookupContractById}>
                  View
                </button>
              </div>

              {lookupResult ? (
                <div className="inspector-box">
                  <div className="inspector-row">
                    <span>ID</span>
                    <strong>{lookupResult.id}</strong>
                  </div>
                  <div className="inspector-row">
                    <span>Status</span>
                    <strong>{lookupResult.status}</strong>
                  </div>
                  <div className="inspector-row">
                    <span>Crop</span>
                    <strong>{lookupResult.cropName}</strong>
                  </div>
                  <div className="inspector-row">
                    <span>Quantity</span>
                    <strong>{lookupResult.quantity}</strong>
                  </div>
                  <div className="inspector-row">
                    <span>Total Price</span>
                    <strong>{lookupResult.priceEth} ETH</strong>
                  </div>
                  <div className="inspector-row">
                    <span>Advance Paid</span>
                    <strong>{lookupResult.advanceEth} ETH</strong>
                  </div>
                  <div className="inspector-row">
                    <span>Buyer</span>
                    <strong>{shortAddress(lookupResult.buyer)}</strong>
                  </div>
                  <div className="inspector-row">
                    <span>Farmer</span>
                    <strong>{shortAddress(lookupResult.farmer)}</strong>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  No contract selected yet. Enter an ID and click <b>View</b>.
                </div>
              )}
            </section>

            <section className="panel-card dark-panel">
              <h3>Operator Checklist</h3>
              <p className="panel-note mb-2">
                Mark readiness items before final demo run.
              </p>
              <div className="progress-track mb-3">
                <div className="progress-fill" style={{ width: `${checklistProgress}%` }} />
              </div>
              <p className="progress-label mb-3">{checklistProgress}% prepared</p>
              <div className="checklist-board">
                <label className="check-item">
                  <input
                    type="checkbox"
                    checked={opsChecklist.walletReady}
                    onChange={() => toggleChecklist("walletReady")}
                  />
                  <span>MetaMask on Ganache with funded accounts</span>
                </label>
                <label className="check-item">
                  <input
                    type="checkbox"
                    checked={opsChecklist.contractReady}
                    onChange={() => toggleChecklist("contractReady")}
                  />
                  <span>Deployment loaded and contract connected</span>
                </label>
                <label className="check-item">
                  <input
                    type="checkbox"
                    checked={opsChecklist.farmerLoaded}
                    onChange={() => toggleChecklist("farmerLoaded")}
                  />
                  <span>Farmer role wallet verified and ready</span>
                </label>
                <label className="check-item">
                  <input
                    type="checkbox"
                    checked={opsChecklist.paymentPlanSet}
                    onChange={() => toggleChecklist("paymentPlanSet")}
                  />
                  <span>Advance + final payment amounts validated</span>
                </label>
              </div>
              <div className="checklist-mini">
                <span>Connected Wallet</span>
                <strong>{shortAddress(account) || "N/A"}</strong>
              </div>
              <div className="checklist-mini">
                <span>Loaded Contract</span>
                <strong>{shortAddress(loadedContractAddress) || "N/A"}</strong>
              </div>
            </section>
          </div>
        </div>

        <footer className="dashboard-footer mt-3">
          <span>AGRICON Enterprise UI</span>
          <span>Smart Contract + React + Web3</span>
          <span>Local Chain: {networkName}</span>
        </footer>
      </div>
    </div>
  );
}

export default App;
