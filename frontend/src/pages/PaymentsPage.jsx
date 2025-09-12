import React, { useState, useEffect, useCallback } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

// CORRECTED: Define months array directly in the frontend.
const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
];

const PaymentsPage = () => {
    const { paymentsData, fetchPayments, handleApiError } = useData();
    const { sessionToken } = useAuth();
    const [currentYear, setCurrentYear] = useState(() => localStorage.getItem("currentYear") || new Date().getFullYear().toString());
    const [availableYears, setAvailableYears] = useState([]);
    const [isLoadingYears, setIsLoadingYears] = useState(false);

    // Fetch available years - same logic as Dashboard
    const fetchUserYears = useCallback(async (forceRefresh = false) => {
        if (!sessionToken) return;

        setIsLoadingYears(true);
        try {
            const yearsData = await api.payments.getUserYears(forceRefresh);
            const sortedYears = (yearsData || [])
                .map(String)
                .sort((a, b) => b.localeCompare(a)); // Desc order

            setAvailableYears(sortedYears);

            // Validate current year selection
            if (sortedYears.length > 0) {
                const storedYear = localStorage.getItem('currentYear');
                if (!sortedYears.includes(storedYear)) {
                    const newYear = sortedYears[0];
                    setCurrentYear(newYear);
                    localStorage.setItem('currentYear', newYear);
                }
            }
        } catch (error) {
            handleApiError(error);
        } finally {
            setIsLoadingYears(false);
        }
    }, [sessionToken, handleApiError]);

    // Initial load - fetch years when component mounts and when sessionToken is available
    useEffect(() => {
        if (sessionToken) {
            fetchUserYears(true);
        }
    }, [sessionToken, fetchUserYears]);

    useEffect(() => {
        if (sessionToken && currentYear) {
            fetchPayments(currentYear);
        }
    }, [currentYear, sessionToken, fetchPayments]);

    const handleYearChange = useCallback((year) => {
        const yearString = year.toString();
        setCurrentYear(yearString);
        localStorage.setItem('currentYear', yearString);
    }, []);

    return (
        <div>
            {/* Header with Year dropdown - removed Add New Year button */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <select
                        value={currentYear}
                        onChange={(e) => handleYearChange(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 w-full sm:w-auto text-sm sm:text-base"
                        disabled={isLoadingYears}
                    >
                        {availableYears.map((year) => (
                            <option key={year} value={year}>
                                {year}
                            </option>
                        ))}
                    </select>
                    {isLoadingYears && (
                        <div className="flex items-center text-sm text-gray-500">
                            <i className="fas fa-spinner fa-spin mr-1"></i>
                            Loading years...
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
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