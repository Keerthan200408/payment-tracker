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
    <div>
      <h1 className="text-2xl font-semibold mb-4">Payments</h1>
      <div className="max-h-[60vh] overflow-y-auto w-full rounded-lg shadow bg-white">
        <table className="min-w-[1200px] w-full">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2 text-center">Client</th>
              <th className="p-2 text-center">Type</th>
              <th className="p-2 text-center">Amount To Be Paid</th>
              {months.map((month) => (
                <th key={month} className="p-2 text-center">
                  {month.charAt(0).toUpperCase() + month.slice(1)}
                </th>
              ))}
              <th className="p-2 text-center">Total Due</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((payment, index) => (
              <tr key={index} className="border-t">
                <td className="p-2 flex items-center">
                  <i className="fas fa-user-circle mr-2"></i>
                  {payment.Client_Name}
                </td>
                <td className="p-2 text-center">{payment.Type || 'N/A'}</td>
                <td className="p-2 text-center">${payment.Amount_To_Be_Paid}</td>
                {months.map((month) => (
                  <td key={month} className="p-2 text-center">
                    {payment[month] || '—'}
                  </td>
                ))}
                <td className="p-2 text-center">${payment.Due_Payment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4">
        <p>
          Showing {(currentPage - 1) * entriesPerPage + 1} to{' '}
          {Math.min(currentPage * entriesPerPage, totalEntries)} of {totalEntries}{' '}
          entries
        </p>
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          {[...Array(totalPages)].map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i + 1)}
              className={`px-4 py-2 border rounded-lg ${
                currentPage === i + 1 ? 'bg-blue-800 text-white' : ''
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentsPage;