import { useState } from 'react';

const PaymentsPage = ({ paymentsData, fetchClients, fetchPayments, sessionToken }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const entriesPerPage = 10;
  const totalEntries = paymentsData.length;
  const totalPages = Math.ceil(totalEntries / entriesPerPage);

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

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-semibold mb-4">Payments</h1>
      <div className="max-h-[60vh] overflow-y-auto w-full rounded-lg shadow bg-white">
        <table className="min-w-[1200px] w-full">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-1 sm:p-2 text-center text-sm sm:text-base">Client</th>
              <th className="p-1 sm:p-2 text-center text-sm sm:text-base">Type</th>
              <th className="p-1 sm:p-2 text-center text-sm sm:text-base">Amount To Be Paid</th>
              {months.map((month) => (
                <th key={month} className="p-1 sm:p-2 text-center text-sm sm:text-base">
                  {month.charAt(0).toUpperCase() + month.slice(1)}
                </th>
              ))}
              <th className="p-1 sm:p-2 text-center text-sm sm:text-base">Total Due</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((payment, index) => (
              <tr key={index} className="border-t">
                <td className="p-1 sm:p-2 flex items-center text-sm sm:text-base">
                  <i className="fas fa-user-circle mr-2"></i>
                  {payment.Client_Name}
                </td>
                <td className="p-1 sm:p-2 text-center text-sm sm:text-base">{payment.Type || 'N/A'}</td>
                <td className="p-1 sm:p-2 text-center text-sm sm:text-base">${payment.Amount_To_Be_Paid}</td>
                {months.map((month) => (
                  <td key={month} className="p-1 sm:p-2 text-center text-sm sm:text-base">
                    {payment[month] || '—'}
                  </td>
                ))}
                <td className="p-1 sm:p-2 text-center text-sm sm:text-base">${payment.Due_Payment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center mt-4 space-y-3 sm:space-y-0">
        <p className="text-sm sm:text-base">
          Showing {(currentPage - 1) * entriesPerPage + 1} to{' '}
          {Math.min(currentPage * entriesPerPage, totalEntries)} of {totalEntries}{' '}
          entries
        </p>
        <div className="flex flex-wrap justify-center sm:justify-end space-x-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 sm:px-4 py-1 sm:py-2 border rounded-lg disabled:opacity-50 text-sm sm:text-base"
          >
            Previous
          </button>
          {[...Array(totalPages)].map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i + 1)}
              className={`px-3 sm:px-4 py-1 sm:py-2 border rounded-lg text-sm sm:text-base ${
                currentPage === i + 1 ? 'bg-blue-800 text-white' : ''
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 sm:px-4 py-1 sm:py-2 border rounded-lg disabled:opacity-50 text-sm sm:text-base"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentsPage;