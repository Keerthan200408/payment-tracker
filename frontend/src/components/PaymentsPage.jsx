import { useState, useEffect } from 'react';
import axios from 'axios';
const BASE_URL = 'https://payment-tracker-aswa.onrender.com/api';

const PaymentsPage = ({ paymentsData, setPaymentsData, fetchClients, fetchPayments, sessionToken, isImporting, currentYear, setCurrentYear, availableYears, setAvailableYears }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const entriesPerPage = 10;
  const totalEntries = paymentsData.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);

  // REMOVED: Duplicate availableYears state declaration
  // const [availableYears, setAvailableYears] = useState([currentYear]);

// useEffect(() => {
//   const years = [];
//   const currentYearNum = new Date().getFullYear();
//   for (let y = 2025; y <= currentYearNum + 1; y++) {
//     years.push(y.toString());
//   }
//   setAvailableYears(years);
// }, []);
 // Update useEffect to sync with availableYears
  useEffect(() => {
    if (!availableYears.includes(currentYear)) {
      setCurrentYear(availableYears[availableYears.length - 1] || '2025');
    }
  }, [availableYears, currentYear, setCurrentYear]);

  const handleYearChange = async (year) => {
  setCurrentYear(year);
  try {
    const response = await axios.get(`${BASE_URL}/get-payments-by-year`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      params: { year },
    });
    console.log(`Payments for ${year} in PaymentsPage:`, response.data); // Debug
    setPaymentsData(response.data);
  } catch (error) {
    console.error(`Error fetching payments for year ${year}:`, error);
  }
};

  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  

  const paginatedData = paymentsData.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );
  console.log('Payments data in PaymentsPage:', paymentsData);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-0">Payments</h2>
        <select
          value={currentYear}
          onChange={(e) => handleYearChange(e.target.value)}
          className="p-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-full sm:w-auto text-sm sm:text-base"
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      {/* ADDED: Missing opening div tag for table container */}
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full">
          <thead>
            <tr className="bg-blue-100 text-left">
              <th className="p-2 text-center border-gray-200">Client</th>
              <th className="p-2 text-center border-gray-200">Type</th>
              <th className="p-2 text-center border-gray-200">
                Amount To Be Paid
              </th>
              {months.map((month) => (
                <th key={month} className="p-2 text-center border-gray-200">
                  {month.charAt(0).toUpperCase() + month.slice(1)}
                </th>
              ))}
              <th className="p-2 text-center border-gray-200">Total Due</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((payment, index) => (
              <tr key={index} className="border-t border-gray-200">
                <td className="p-2 flex items-center text-sm sm:text-base">
                  <i className="fas fa-user-circle mr-2"></i>
                  {payment.Client_Name}
                </td>
                <td className="p-2 text-center text-sm sm:text-base">
                  {payment.Type || "N/A"}
                </td>
                <td className="p-2 text-center text-sm sm:text-base">
                  ₹{payment.Amount_To_Be_Paid}
                </td>
                {months.map((month) => (
                  <td
                    key={month}
                    className="p-2 text-center text-sm sm:text-base"
                  >
                    {payment[month] || "—"}
                  </td>
                ))}
                <td className="p-2 text-center text-sm sm:text-base">
                  ₹{payment.Due_Payment}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center mt-4 space-y-3 sm:space-y-0">
        <p className="text-sm sm:text-base">
          Showing {(currentPage - 1) * entriesPerPage + 1} to{" "}
          {Math.min(currentPage * entriesPerPage, totalEntries)} of{" "}
          {totalEntries} entries
        </p>
        <div className="flex flex-wrap justify-center sm:justify-end space-x-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 border rounded-md disabled:opacity-50 text-sm sm:text-base"
          >
            Previous
          </button>
          {[...Array(totalPages)].map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i + 1)}
              className={`px-3 py-1.5 border rounded-md text-sm sm:text-base ${
                currentPage === i + 1 ? "bg-blue-500 text-white" : ""
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 border rounded-md disabled:opacity-50 text-sm sm:text-base"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentsPage;