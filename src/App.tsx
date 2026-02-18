import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  Plus,
  Trash2,
  RefreshCw,
  Tag,
  LayoutDashboard,
  List,
  PieChart as PieChartIcon,
  ExternalLink,
  Copy,
  Bitcoin,
  Shield,
  Eye,
  EyeOff,
  Zap,
  Clock,
} from "lucide-react";

// --- API Utilities ---

const COINGECKO_API =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";
const MEMPOOL_API_BASE = "https://mempool.space/api/address";
const MEMPOOL_FEES_API = "https://mempool.space/api/v1/fees/recommended";

const fetchBtcPrice = async () => {
  try {
    const response = await fetch(COINGECKO_API);
    const data = await response.json();
    return {
      price: data.bitcoin.usd,
      change24h: data.bitcoin.usd_24h_change,
    };
  } catch (error) {
    console.error("Error fetching price:", error);
    return null;
  }
};

const fetchFees = async () => {
  try {
    const response = await fetch(MEMPOOL_FEES_API);
    return await response.json();
  } catch (error) {
    console.error("Error fetching fees:", error);
    return null;
  }
};

const fetchAddressData = async (address) => {
  try {
    // 1. Fetch Balance Info
    const balanceResponse = await fetch(`${MEMPOOL_API_BASE}/${address}`);
    if (!balanceResponse.ok) throw new Error("Invalid address or API error");
    const balanceData = await balanceResponse.json();

    const confirmed =
      balanceData.chain_stats.funded_txo_sum -
      balanceData.chain_stats.spent_txo_sum;
    const mempool =
      balanceData.mempool_stats.funded_txo_sum -
      balanceData.mempool_stats.spent_txo_sum;
    const balanceSats = confirmed + mempool;

    // 2. Fetch Latest Transactions for Timestamp
    const txsResponse = await fetch(`${MEMPOOL_API_BASE}/${address}/txs`);
    const txsData = await txsResponse.json();

    let lastTxTime = null;
    if (txsData && txsData.length > 0) {
      // If unconfirmed, use current time, otherwise use block time
      const latestTx = txsData[0];
      if (latestTx.status.confirmed) {
        lastTxTime = latestTx.status.block_time * 1000; // Convert to ms
      } else {
        lastTxTime = "pending"; // Mark as pending
      }
    }

    return { balanceSats, lastTxTime };
  } catch (error) {
    console.error(`Error fetching data for ${address}:`, error);
    return null;
  }
};

// --- Components ---

const Card = ({ children, className = "" }) => (
  <div
    className={`bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg ${className}`}
  >
    {children}
  </div>
);

const Badge = ({ children, color = "blue" }) => {
  const colors = {
    blue: "bg-blue-900/30 text-blue-400 border-blue-800",
    green: "bg-green-900/30 text-green-400 border-green-800",
    orange: "bg-orange-900/30 text-orange-400 border-orange-800",
    purple: "bg-purple-900/30 text-purple-400 border-purple-800",
    gray: "bg-gray-700 text-gray-300 border-gray-600",
  };
  return (
    <span
      className={`px-2 py-1 rounded-md text-xs font-medium border ${
        colors[color] || colors.blue
      }`}
    >
      {children}
    </span>
  );
};

const formatSats = (sats) => {
  return (sats / 100000000).toLocaleString("en-US", {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  });
};

const formatUSD = (val) => {
  return val.toLocaleString("en-US", { style: "currency", currency: "USD" });
};

const formatDate = (timestamp) => {
  if (!timestamp) return "Never";
  if (timestamp === "pending") return "Pending...";
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// --- Main App Component ---

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(0);
  const [fees, setFees] = useState(null);

  // Initialize state from LocalStorage
  const [addresses, setAddresses] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sats-tracker-addresses");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [isPrivacyMode, setIsPrivacyMode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sats-tracker-privacy");
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });

  const [loading, setLoading] = useState(false);

  // Chart state
  const [chartMode, setChartMode] = useState("group"); // 'group' or 'address'

  // Input states
  const [newAddress, setNewAddress] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState("General");

  // Ref for accessing latest addresses in interval
  const addressesRef = useRef(addresses);

  // --- Effects ---

  // Save to LocalStorage whenever state changes
  useEffect(() => {
    localStorage.setItem("sats-tracker-addresses", JSON.stringify(addresses));
    addressesRef.current = addresses; // Update ref for interval
  }, [addresses]);

  useEffect(() => {
    localStorage.setItem("sats-tracker-privacy", JSON.stringify(isPrivacyMode));
  }, [isPrivacyMode]);

  // --- Data Logic ---

  const refreshData = async () => {
    setLoading(true);

    // 1. Update Price
    const priceData = await fetchBtcPrice();
    if (priceData) {
      setBtcPrice(priceData.price);
      setPriceChange(priceData.change24h);
    }

    // 2. Update Fees
    const feesData = await fetchFees();
    if (feesData) {
      setFees(feesData);
    }

    // 3. Update Balances (Use ref to ensure we have latest list during intervals)
    const currentAddresses = addressesRef.current;
    if (currentAddresses.length > 0) {
      const updatedAddresses = await Promise.all(
        currentAddresses.map(async (addr) => {
          const addressData = await fetchAddressData(addr.address);
          return {
            ...addr,
            balanceSats: addressData
              ? addressData.balanceSats
              : addr.balanceSats,
            lastTxTime: addressData
              ? addressData.lastTxTime
              : addr.lastTxTime || null,
            lastUpdated: new Date(),
          };
        })
      );
      setAddresses(updatedAddresses);
    }

    setLoading(false);
  };

  // Initial load & Interval
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 60000); // Auto-refresh every 60s
    return () => clearInterval(interval);
  }, []);

  // --- Export/Import Logic ---

  const downloadBackup = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(addresses));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "sats_tracker_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const triggerImport = () => {
    document.getElementById("import-file").click();
  };

  const handleImport = (event) => {
    const fileReader = new FileReader();
    fileReader.readAsText(event.target.files[0], "UTF-8");
    fileReader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        if (Array.isArray(importedData)) {
          // Basic validation to ensure it looks like our data
          const valid = importedData.every((item) => item.address && item.id);
          if (valid) {
            setAddresses(importedData);
            alert("Backup imported successfully!");
          } else {
            alert("Invalid backup file format.");
          }
        }
      } catch (error) {
        console.error("Error parsing file:", error);
        alert("Error reading file.");
      }
    };
  };

  const addAddress = async () => {
    if (!newAddress) return;

    setLoading(true);
    const addressData = await fetchAddressData(newAddress);

    if (!addressData) {
      alert(
        "Could not fetch address. Please check if it's a valid Bitcoin address."
      );
      setLoading(false);
      return;
    }

    const newEntry = {
      id: Date.now(),
      address: newAddress,
      label: newLabel || "My Wallet",
      group: newGroup || "General",
      balanceSats: addressData.balanceSats,
      lastTxTime: addressData.lastTxTime,
      lastUpdated: new Date(),
    };

    setAddresses((prev) => [...prev, newEntry]);
    setNewAddress("");
    setNewLabel("");
    setLoading(false);
  };

  const removeAddress = (id) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  };

  // --- Computed Stats ---

  const totalSats = useMemo(
    () => addresses.reduce((acc, curr) => acc + curr.balanceSats, 0),
    [addresses]
  );
  const totalBTC = totalSats / 100000000;
  const totalUSD = btcPrice ? totalBTC * btcPrice : 0;

  const groupStats = useMemo(() => {
    const stats = {};
    addresses.forEach((addr) => {
      if (!stats[addr.group]) stats[addr.group] = 0;
      stats[addr.group] += addr.balanceSats;
    });
    return Object.entries(stats)
      .map(([name, sats]) => ({
        name,
        value: sats,
        btc: sats / 100000000,
        usd: btcPrice ? (sats / 100000000) * btcPrice : 0,
      }))
      .filter((item) => item.value > 0) // Filter out zero balances
      .sort((a, b) => b.value - a.value);
  }, [addresses, btcPrice]);

  const addressStats = useMemo(() => {
    return addresses
      .map((addr) => ({
        name: addr.address, // Store full address as name
        label: addr.label, // Store label for reference if needed
        value: addr.balanceSats,
        btc: addr.balanceSats / 100000000,
        usd: btcPrice ? (addr.balanceSats / 100000000) * btcPrice : 0,
      }))
      .filter((item) => item.value > 0) // Filter out zero balances
      .sort((a, b) => b.value - a.value);
  }, [addresses, btcPrice]);

  const chartData = chartMode === "group" ? groupStats : addressStats;
  const COLORS = [
    "#F7931A",
    "#3B82F6",
    "#10B981",
    "#8B5CF6",
    "#EC4899",
    "#EF4444",
    "#6366F1",
    "#F59E0B",
    "#14B8A6",
    "#06B6D4",
    "#84CC16",
    "#D946EF",
    "#F43F5E",
    "#EAB308",
    "#64748B",
  ];

  // --- Custom Tooltip Component ---
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-900/60 backdrop-blur-md border border-gray-700/50 p-3 rounded-lg shadow-xl">
          <p className="font-bold text-white mb-1 text-sm">
            {chartMode === "address" ? data.label || "Wallet" : data.name}
          </p>

          {chartMode === "address" && (
            <div className="mb-2 p-1.5 bg-gray-800/50 rounded border border-gray-700/30">
              <p className="text-[10px] text-gray-300 font-mono break-all leading-tight">
                {data.name}
              </p>
            </div>
          )}

          <div className="space-y-0.5">
            <div className="flex justify-between items-center gap-4 text-xs">
              <span className="text-gray-300">Balance:</span>
              <span className="text-orange-400 font-mono font-medium">
                {formatSats(data.value)} BTC
              </span>
            </div>
            <div className="flex justify-between items-center gap-4 text-xs">
              <span className="text-gray-300">Value:</span>
              <span className="text-green-400 font-mono font-medium">
                {formatUSD(data.usd)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // --- Renderers ---

  const renderDashboard = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 bg-gradient-to-br from-gray-800 to-gray-900 border-orange-500/20">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-gray-400 text-sm font-medium uppercase tracking-wider">
                Total Portfolio Value
              </h2>
              <div className="mt-2 flex items-baseline gap-3">
                <span
                  className={`text-4xl font-bold text-white ${
                    isPrivacyMode ? "blur-sm" : ""
                  }`}
                >
                  {formatUSD(totalUSD)}
                </span>
                <span className="text-orange-400 font-mono text-lg">
                  {isPrivacyMode ? "***" : totalBTC.toFixed(8)} BTC
                </span>
              </div>
            </div>
            <div className="bg-orange-500/10 p-3 rounded-full">
              <Bitcoin className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <div className="text-sm text-gray-500">
            Backed by {addresses.length} tracked addresses
          </div>
        </Card>

        <Card>
          <h2 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-2">
            Network Status
          </h2>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-2xl font-bold text-white mb-1">
                {btcPrice ? formatUSD(btcPrice) : "Loading..."}
              </div>
              <div
                className={`flex items-center gap-1 text-sm ${
                  priceChange >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>{priceChange.toFixed(2)}% (24h)</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-700">
            <div className="flex items-center gap-2 mb-2 text-xs text-gray-400 uppercase tracking-wider">
              <Zap className="w-3 h-3 text-yellow-500" />
              Current Fees (sat/vB)
            </div>
            {fees ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-red-900/20 rounded p-1.5 border border-red-500/20">
                  <div className="text-red-400 font-bold">
                    {fees.fastestFee}
                  </div>
                  <div className="text-[10px] text-gray-500">High Priority</div>
                </div>
                <div className="bg-orange-900/20 rounded p-1.5 border border-orange-500/20">
                  <div className="text-orange-400 font-bold">
                    {fees.halfHourFee}
                  </div>
                  <div className="text-[10px] text-gray-500">Medium</div>
                </div>
                <div className="bg-green-900/20 rounded p-1.5 border border-green-500/20">
                  <div className="text-green-400 font-bold">{fees.hourFee}</div>
                  <div className="text-[10px] text-gray-500">Low</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">
                Loading fees...
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Allocation Chart */}
      {addresses.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-gray-400" />
                Portfolio Allocation
              </h3>
              <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700 self-start">
                <button
                  onClick={() => setChartMode("group")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    chartMode === "group"
                      ? "bg-gray-700 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  By Group
                </button>
                <button
                  onClick={() => setChartMode("address")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    chartMode === "address"
                      ? "bg-gray-700 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  By Address
                </button>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-white mb-4">
              {chartMode === "group" ? "Group Breakdown" : "Address Breakdown"}
            </h3>
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {chartData.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-700/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    <span
                      className="font-medium text-white text-sm truncate max-w-[150px]"
                      title={item.name}
                    >
                      {chartMode === "address"
                        ? `${item.name.slice(0, 5)}...${item.name.slice(-4)}`
                        : item.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-white font-medium text-sm ${
                        isPrivacyMode ? "blur-sm" : ""
                      }`}
                    >
                      {formatUSD(item.usd)}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">
                      {item.btc.toFixed(6)} BTC
                    </div>
                  </div>
                </div>
              ))}
              {chartData.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">
                  No balances found.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );

  const renderAddresses = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Add New Address Card */}
      <Card className="border-blue-500/20 bg-blue-900/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-blue-400" />
          Track New Address
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-6">
            <input
              type="text"
              placeholder="Bitcoin Address (bc1... or 1...)"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <input
              type="text"
              placeholder="Label (e.g. Ledger)"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <select
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            >
              <option value="General">General</option>
              <option value="Savings">Savings</option>
              <option value="Cold Storage">Cold Storage</option>
              <option value="Hot Wallet">Hot Wallet</option>
              <option value="Exchange">Exchange</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <button
              onClick={addAddress}
              disabled={loading || !newAddress}
              className="w-full h-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </Card>

      {/* List */}
      <div className="space-y-4">
        {addresses.map((addr) => (
          <div
            key={addr.id}
            className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-gray-600 transition-colors"
          >
            <div className="flex-1 overflow-hidden min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-white font-medium truncate">
                  {addr.label}
                </span>
                <Badge color="purple">{addr.group}</Badge>
              </div>
              <div className="flex items-center gap-2 text-gray-500 text-sm font-mono mb-2">
                <span className="truncate">{addr.address}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(addr.address)}
                  className="hover:text-white transition-colors flex-shrink-0"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <a
                  href={`https://mempool.space/address/${addr.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors flex-shrink-0"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                <span>
                  Last Activity:{" "}
                  <span className="text-gray-300">
                    {formatDate(addr.lastTxTime)}
                  </span>
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-6 min-w-[200px] flex-shrink-0">
              <div className="text-right">
                <div
                  className={`text-white font-bold ${
                    isPrivacyMode ? "blur-sm" : ""
                  }`}
                >
                  {formatSats(addr.balanceSats)} BTC
                </div>
                <div
                  className={`text-sm text-gray-400 ${
                    isPrivacyMode ? "blur-sm" : ""
                  }`}
                >
                  {btcPrice
                    ? formatUSD((addr.balanceSats / 100000000) * btcPrice)
                    : "..."}
                </div>
              </div>
              <button
                onClick={() => removeAddress(addr.id)}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}

        {addresses.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No addresses tracked yet.</p>
            <p className="text-sm">
              Add a public address to start your portfolio.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-orange-500/30">
      {/* Sidebar / Nav */}
      <div className="fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 hidden md:flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-2 text-orange-500 font-bold text-xl">
            <Bitcoin className="w-8 h-8" />
            <span>SatsTracker</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Private Portfolio</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              activeTab === "dashboard"
                ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab("addresses")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              activeTab === "addresses"
                ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <List className="w-5 h-5" />
            Addresses
          </button>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={() => setIsPrivacyMode(!isPrivacyMode)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-all"
          >
            {isPrivacyMode ? (
              <Eye className="w-5 h-5" />
            ) : (
              <EyeOff className="w-5 h-5" />
            )}
            Privacy Mode
          </button>
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-600 px-2">
            <Shield className="w-3 h-3" />
            <span>Local Session Only</span>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2 text-orange-500 font-bold">
          <Bitcoin className="w-6 h-6" />
          <span>SatsTracker</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`p-2 rounded-lg ${
              activeTab === "dashboard"
                ? "bg-orange-500 text-white"
                : "text-gray-400"
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab("addresses")}
            className={`p-2 rounded-lg ${
              activeTab === "addresses"
                ? "bg-orange-500 text-white"
                : "text-gray-400"
            }`}
          >
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="md:ml-64 p-6 md:p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white capitalize">
              {activeTab}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {activeTab === "dashboard"
                ? "Overview of your holdings"
                : "Manage your public keys"}
            </p>
          </div>
          <button
            onClick={refreshData}
            className={`p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition-all ${
              loading ? "animate-spin" : ""
            }`}
            title="Refresh Data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </header>

        {activeTab === "dashboard" ? renderDashboard() : renderAddresses()}
      </div>
    </div>
  );
}
