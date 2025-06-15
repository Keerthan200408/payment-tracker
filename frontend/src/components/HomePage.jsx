import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import axios from "axios";

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";

const HomePage = ({
  paymentsData,
  setPaymentsData,
  searchQuery,
  setSearchQuery,
  monthFilter,
  setMonthFilter,
  statusFilter,
  setStatusFilter,
  updatePayment,
  handleContextMenu,
  contextMenu,
  hideContextMenu,
  deleteRow,
  setPage,
  csvFileInputRef,
  importCsv,
  isReportsPage = false,
  isImporting,
  sessionToken,
  currentYear,
  setCurrentYear,
  handleYearChange,
  onMount,
}) => {
  // Prevent infinite re-renders by using useCallback for onMount
  const stableOnMount = useCallback(() => {
    if (onMount && typeof onMount === 'function') {
      onMount();
    }
  }, [onMount]);

  // Only call onMount once when component first mounts
  useEffect(() => {
    stableOnMount();
  }, [stableOnMount]);

  const months = useMemo(() => [
    "january",
    "february", 
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ], []);

  const [availableYears, setAvailableYears] = useState(["2025"]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isLoadingYears, setIsLoadingYears] = useState(false);

  // Sync selectedYear with currentYear for Reports view
  useEffect(() => {
    if (isReportsPage && currentYear !== selectedYear) {
      console.log("HomePage.jsx: Syncing selectedYear to currentYear:", currentYear, "for Reports");
      setSelectedYear(currentYear);
    }
  }, [currentYear, isReportsPage, selectedYear]);

  // Log payments data updates (with debouncing to prevent spam)
  useEffect(() => {
    if (paymentsData?.length) {
      const timeoutId = setTimeout(() => {
        console.log(
          "HomePage.jsx: Payments data updated:",
          paymentsData.length,
          "items for year",
          isReportsPage ? selectedYear : currentYear,
          "on",
          isReportsPage ? "Reports" : "Dashboard"
        );
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [paymentsData?.length, currentYear, selectedYear, isReportsPage]);

  const mountedRef = useRef(true);

useEffect(() => {
  mountedRef.current = true;
  return () => {
    mountedRef.current = false;
  };
}, []);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryWithBackoff = async (fn, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429 && i < retries - 1) {
        console.log(`HomePage.jsx: Rate limit hit, retrying in ${delay}ms...`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
};

const searchUserYears = useCallback(async (cancelToken) => {
  if (!sessionToken) {
    console.log("HomePage.jsx: No sessionToken or already loading years");
    return;
  }

  setIsLoadingYears(true);
  console.log("HomePage.jsx: Fetching user-specific years from API");

  try {
    const response = await axios.get(`${BASE_URL}/get-user-years`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      timeout: 10000,
      cancelToken,
    });

    console.log("HomePage.jsx: API response for user years:", response.data);

    const fetchedYears = (response.data || [])
      .filter((year) => parseInt(year) >= 2025)
      .sort((a, b) => parseInt(a) - parseInt(b));

    const yearsToSet = fetchedYears.length > 0 ? fetchedYears : ["2025"];
    console.log("HomePage.jsx: Setting availableYears to:", yearsToSet);

    if (mountedRef.current) {
      setAvailableYears(yearsToSet);
      localStorage.setItem("availableYears", JSON.stringify(yearsToSet));

      const storedYear = localStorage.getItem("currentYear");
      let yearToSet;

      if (storedYear && yearsToSet.includes(storedYear)) {
        yearToSet = storedYear;
      } else {
        yearToSet = yearsToSet[yearsToSet.length - 1] || "2025";
      }

      if (yearToSet !== currentYear) {
        console.log("HomePage.jsx: Setting currentYear to:", yearToSet);
        setCurrentYear(yearToSet);
        localStorage.setItem("currentYear", yearToSet);

        if (typeof handleYearChange === "function") {
          console.log("HomePage.jsx: Calling handleYearChange with:", yearToSet);
          await handleYearChange(yearToSet);
        }
      }
    }
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log("HomePage.jsx: Fetch years request cancelled");
      return;
    }
    console.error("HomePage.jsx: Error fetching user years:", error);

    const cachedYears = localStorage.getItem("availableYears");
    const fallbackYears = cachedYears ? JSON.parse(cachedYears) : ["2025"];
    console.log("HomePage.jsx: Using fallback years:", fallbackYears);

    if (mountedRef.current) {
      setAvailableYears(fallbackYears);

      const storedYear = localStorage.getItem("currentYear");
      const yearToSet = storedYear && fallbackYears.includes(storedYear) ? storedYear : "2025";

      if (yearToSet !== currentYear) {
        setCurrentYear(yearToSet);
        localStorage.setItem("currentYear", yearToSet);

        if (typeof handleYearChange === "function") {
          await handleYearChange(yearToSet);
        }
      }
    }
  } finally {
    if (mountedRef.current) {
      setIsLoadingYears(false);
    }
  }
}, [sessionToken, currentYear, handleYearChange, setCurrentYear]);

useEffect(() => {
  const controller = axios.CancelToken.source();

  if (sessionToken) {
    console.log("HomePage.jsx: SessionToken available, fetching years");
    searchUserYears(controller.token);
  }

  return () => {
    controller.cancel("Component unmounted or sessionToken changed");
  };
}, [sessionToken]);

  // Memoized function to handle adding new year
const handleAddNewYear = useCallback(async () => {
  const newYear = (parseInt(currentYear) + 1).toString();
  console.log(`HomePage.jsx: Attempting to add new year: ${newYear}`);

  if (mountedRef.current) {
    setIsLoadingYears(true);
  }

  const controller = axios.CancelToken.source();

  try {
    const response = await axios.post(
      `${BASE_URL}/add-new-year`,
      { year: newYear },
      {
        headers: { Authorization: `Bearer ${sessionToken}` },
        timeout: 10000,
        cancelToken: controller.token,
      }
    );
    console.log("HomePage.jsx: Add new year response:", response.data);

    await searchUserYears(controller.token);

    if (mountedRef.current) {
      setCurrentYear(newYear);
      localStorage.setItem("currentYear", newYear);

      if (typeof handleYearChange === "function") {
        await handleYearChange(newYear);
      }

      alert(response.data.message);
    }
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log("HomePage.jsx: Add new year request cancelled");
      return;
    }
    console.error("HomePage.jsx: Error adding new year:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    alert(
      `Failed to add new year: ${
        error.response?.data?.error || "An unknown error occurred. Please try again."
      }`
    );
  } finally {
    if (mountedRef.current) {
      setIsLoadingYears(false);
    }
  }
}, [currentYear, sessionToken, handleYearChange, searchUserYears]);

  const tableRef = useRef(null);

  // Handle clicks outside table for context menu
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        hideContextMenu();
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [hideContextMenu]);

  // Memoized helper functions
  const getPaymentStatusForMonth = useCallback((row, month) => {
    const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 0;
    const paidInMonth = parseFloat(row[month]) || 0;
    if (paidInMonth === 0) return "Unpaid";
    if (paidInMonth >= amountToBePaid) return "Paid";
    return "PartiallyPaid";
  }, []);

  const getMonthlyStatus = useCallback((row, month) => {
    const amountToBePaid = parseFloat(row.Amount_To_Be_Paid) || 0;
    const paidInMonth = parseFloat(row[month]) || 0;
    if (paidInMonth === 0) return "Unpaid";
    if (paidInMonth >= amountToBePaid) return "Paid";
    return "PartiallyPaid";
  }, []);

  const getInputBackgroundColor = useCallback((row, month) => {
    const status = getPaymentStatusForMonth(row, month);
    if (status === "Unpaid") return "bg-red-100/60";
    if (status === "PartiallyPaid") return "bg-yellow-100/60";
    if (status === "Paid") return "bg-green-100/60";
    return "bg-white";
  }, [getPaymentStatusForMonth]);

  // Memoized filtered data to prevent unnecessary re-calculations
  const filteredData = useMemo(() => {
    return paymentsData.filter((row) => {
      const matchesSearch =
        !searchQuery ||
        row.Client_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.Type?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesMonth =
        !monthFilter ||
        (row[monthFilter.toLowerCase()] !== undefined &&
          row[monthFilter.toLowerCase()] !== null);

      const matchesStatus = !monthFilter
        ? true
        : !statusFilter ||
          (statusFilter === "Paid" &&
            getPaymentStatusForMonth(row, monthFilter.toLowerCase()) === "Paid") ||
          (statusFilter === "PartiallyPaid" &&
            getPaymentStatusForMonth(row, monthFilter.toLowerCase()) === "PartiallyPaid") ||
          (statusFilter === "Unpaid" &&
            getPaymentStatusForMonth(row, monthFilter.toLowerCase()) === "Unpaid");

      return matchesSearch && matchesMonth && matchesStatus;
    });
  }, [paymentsData, searchQuery, monthFilter, statusFilter, getPaymentStatusForMonth]);

  // Memoized year change handler
  const handleYearChangeDebounced = useCallback((year) => {
    console.log("HomePage.jsx: Year change requested to:", year);
    
    // Debounce the year change to prevent rapid updates
    const timeoutId = setTimeout(() => {
      setCurrentYear(year);
      localStorage.setItem("currentYear", year);
      
      if (typeof handleYearChange === "function") {
        handleYearChange(year);
      } else {
        console.warn("HomePage.jsx: handleYearChange is not a function");
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [handleYearChange, setCurrentYear]);

  const renderDashboard = () => (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
  <div className="flex gap-3 mb-4 sm:mb-0">
    <button
      onClick={() => setPage("addClient")}
      className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center"
    >
      <i className="fas fa-plus mr-2"></i> Add Client
    </button>
    <input
      type="file"
      accept=".csv"
      ref={csvFileInputRef}
      onChange={importCsv}
      className="hidden"
      id="csv-import"
      disabled={isImporting}
    />
    <label
      htmlFor="csv-import"
      className={`px-4 py-2 rounded-lg text-gray-700 bg-white border border-gray-300 flex items-center ${
        isImporting
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-gray-50 cursor-pointer"
      } transition duration-200`}
    >
      <i className="fas fa-upload mr-2"></i>
      {isImporting ? "Importing..." : "Bulk Import(in CSV format)"}
    </label>
    <button
      onClick={handleAddNewYear}
      className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center"
      disabled={isLoadingYears}
    >
      <i className="fas fa-calendar-plus mr-2"></i>
      {isLoadingYears ? "Loading..." : "Add New Year"}
    </button>
  </div>
  <select
    value={currentYear}
    onChange={(e) => {
      const year = e.target.value;
      console.log("HomePage.jsx: Dashboard dropdown year changed to:", year);
      handleYearChangeDebounced(year);
    }}
    className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
    disabled={isLoadingYears}
  >
    {availableYears.map((year) => (
      <option key={year} value={year}>
        {year}
      </option>
    ))}
  </select>
</div>

<div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mb-6">
  <div className="relative flex-1 sm:w-1/3">
    <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
    <input
      type="text"
      placeholder="Search by client or type..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base"
    />
  </div>
  <select
    value={monthFilter}
    onChange={(e) => setMonthFilter(e.target.value)}
    className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
  >
    <option value="">All Months</option>
    {months.map((month, index) => (
      <option key={index} value={month}>
        {month.charAt(0).toUpperCase() + month.slice(1)}
      </option>
    ))}
  </select>
  <select
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
    className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
    disabled={!monthFilter}
  >
    <option value="">Status</option>
    <option value="Paid">Paid</option>
    <option value="PartiallyPaid">Partially Paid</option>
    <option value="Unpaid">Unpaid</option>
  </select>
</div>

<div className="bg-white rounded-lg shadow-sm overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full" ref={tableRef}>
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Client Name
          </th>
          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Type
          </th>
          <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
            Amount To Be Paid
          </th>
          {months.map((month, index) => (
            <th
              key={index}
              className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {month.charAt(0).toUpperCase() + month.slice(1)}
            </th>
          ))}
          <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
            Due Payment
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {filteredData.length === 0 ? (
          <tr>
            <td
              colSpan={15}
              className="px-6 py-12 text-center text-gray-500"
            >
              No payments found.
            </td>
          </tr>
        ) : (
          filteredData.map((row, rowIndex) => (
            <tr
              key={`${row.Client_Name}-${rowIndex}`}
              onContextMenu={(e) => handleContextMenu(e, rowIndex)}
              className="hover:bg-gray-50"
            >
              <td className="px-6 py-4 whitespace-nowrap">{row.Client_Name}</td>
              <td className="px-6 py-4 whitespace-nowrap">{row.Type}</td>
              <td className="px-6 py-4 whitespace-nowrap text-right">
                {parseFloat(row.Amount_To_Be_Paid || 0).toFixed(2)}
              </td>
              {months.map((month, colIndex) => (
                <td key={colIndex} className="px-6 py-4 whitespace-nowrap text-right">
                  <input
                    type="text"
                    value={row[month] || ""}
                    onChange={(e) =>
                      updatePayment(
                        rowIndex,
                        month,
                        e.target.value,
                        currentYear
                      )
                    }
                    className="w-20 p-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-gray-500 focus:border-gray-500 text-sm sm:text-base bg-white"
                    placeholder="0.00"
                  />
                </td>
              ))}
              <td className="px-6 py-4 whitespace-nowrap text-right">
                {parseFloat(row.Due_Payment || 0).toFixed(2)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
</div>

{contextMenu && (
  <div
    className="absolute bg-white border border-gray-300 rounded-lg shadow-sm p-2 z-50"
    style={{ top: contextMenu.y, left: contextMenu.x }}
  >
    <button
      onClick={deleteRow}
      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex items-center"
    >
      <i className="fas fa-trash mr-2"></i> Delete
    </button>
  </div>
)}
    </>
  );

  const renderReports = () => {
    const monthStatus = useMemo(() => {
  return paymentsData.reduce((acc, row) => {
    if (!acc[row.Client_Name]) {
      acc[row.Client_Name] = {};
    }
    months.forEach((month) => {
      acc[row.Client_Name][month] = getMonthlyStatus(row, month);
    });
    return acc;
  }, {});
}, [paymentsData, months, getMonthlyStatus]);

return (
  <>
    <h2 className="text-xl font-medium text-gray-900 mb-4">
      Monthly Client Status Report ({selectedYear})
    </h2>
    <div className="flex mb-6">
      <select
        value={selectedYear}
        onChange={(e) => {
          const year = e.target.value;
          console.log("HomePage.jsx: Reports dropdown year changed to:", year);
          setSelectedYear(year);
          if (typeof handleYearChange === "function") {
            handleYearChange(year);
          }
        }}
        className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
        disabled={isLoadingYears}
      >
        {availableYears.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client Name
              </th>
              {months.map((month, index) => (
                <th
                  key={index}
                  className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {month.charAt(0).toUpperCase() + month.slice(1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.keys(monthStatus).length === 0 ? (
              <tr>
                <td
                  colSpan={13}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  No data available.
                </td>
              </tr>
            ) : (
              Object.keys(monthStatus).map((client, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">{client}</td>
                  {months.map((month, mIdx) => (
                    <td key={mIdx} className="px-6 py-4 whitespace-nowrap text-center">
                      <span
                        className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                      >
                        {monthStatus[client][month] || "Unpaid"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  </>
);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {isReportsPage ? renderReports() : renderDashboard()}
    </div>
  );
};

export default HomePage;