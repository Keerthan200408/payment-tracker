import React, { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';

// ASSUMPTION: This component exists in the specified path.
import YearSelector from '../components/dashboard/YearSelector';

// CORRECTED: Define months array directly in the frontend.
const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
];

const PaymentsPage = () => {
    const { paymentsData, fetchPayments } = useData();
    const [currentYear, setCurrentYear] = useState(() => localStorage.getItem("currentYear") || new Date().getFullYear().toString());
    const [availableYears, setAvailableYears] = useState([currentYear]); // This should be populated from API

    useEffect(() => {
        fetchPayments(currentYear);
    }, [currentYear, fetchPayments]);

    const handleYearChange = (year) => {
        setCurrentYear(year);
        // fetchPayments is called by the useEffect above
    };

    return (
        <div>
            <YearSelector 
                currentYear={currentYear}
                availableYears={availableYears}
                onYearChange={handleYearChange}
            />
            <div className="bg-white rounded-lg shadow-sm overflow-hidden mt-6">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                {months.map(month => (
                                    <th key={month} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                        {month.charAt(0).toUpperCase() + month.slice(1)}
                                    </th>
                                ))}
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Due</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {paymentsData.map((payment, index) => (
                                <tr key={index}>
                                    <td className="px-6 py-4 whitespace-nowrap">{payment.Client_Name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{payment.Type}</td>
                                    {months.map(month => (
                                        <td key={month} className="px-6 py-4 whitespace-nowrap text-right">
                                            {payment[month] ? `₹${payment[month]}` : '—'}
                                        </td>
                                    ))}
                                    <td className="px-6 py-4 whitespace-nowrap text-right font-semibold">₹{payment.Due_Payment}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PaymentsPage;