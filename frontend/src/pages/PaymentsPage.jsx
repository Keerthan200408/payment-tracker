import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import YearSelector from '../components/dashboard/YearSelector'; // Re-using the year selector

const PaymentsPage = () => {
    const { paymentsData, fetchPayments } = useData();
    const [currentYear, setCurrentYear] = useState(() => localStorage.getItem("currentYear") || new Date().getFullYear().toString());
    const [availableYears, setAvailableYears] = useState([currentYear]); // This should be populated from API
    
    const handleYearChange = (year) => {
        setCurrentYear(year);
        fetchPayments(year);
    };

    return (
        <div>
            <YearSelector 
                currentYear={currentYear}
                availableYears={availableYears}
                onYearChange={handleYearChange}
            />
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                {/* This would be a simplified, read-only version of the DataTable */}
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Due</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {paymentsData.map((payment, index) => (
                            <tr key={index}>
                                <td className="px-6 py-4 whitespace-nowrap">{payment.Client_Name}</td>
                                <td className="px-6 py-4 whitespace-nowrap">{payment.Type}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">₹{payment.Due_Payment}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PaymentsPage;