import React, { useState, useEffect, useCallback } from 'react';
import { useData } from '../contexts/DataContext';
import api from '../api';

// CORRECTED: Define months array directly in the frontend.
const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
];

const PaymentsPage = () => {
    const { paymentsData, fetchPayments, handleApiError } = useData();
    const [currentYear, setCurrentYear] = useState(() => localStorage.getItem("currentYear") || new Date().getFullYear().toString());
    const [availableYears, setAvailableYears] = useState([currentYear]);
    const [isLoadingYears, setIsLoadingYears] = useState(false);

    // Fetch available years
    const fetchUserYears = useCallback(async (forceRefresh = false) => {
        try {
            setIsLoadingYears(true);
            const response = await api.payments.getUserYears(forceRefresh);
            const years = response?.data?.years || [];
            const sortedYears = years.sort((a, b) => parseInt(b) - parseInt(a));
            setAvailableYears(sortedYears);
        } catch (error) {
            handleApiError(error);
        } finally {
            setIsLoadingYears(false);
        }
    }, [handleApiError]);

    useEffect(() => {
        fetchPayments(currentYear);
        fetchUserYears();
    }, [currentYear, fetchPayments, fetchUserYears]);

    const handleYearChange = useCallback((year) => {
        const yearString = year.toString();
        setCurrentYear(yearString);
        localStorage.setItem('currentYear', yearString);
    }, []);

    // Handle adding a new year
    const handleAddNewYear = useCallback(async () => {
        if (availableYears.length === 0) {
            alert('Please wait for years to load before adding a new year.');
            return;
        }

        const latestYear = Math.max(...availableYears.map(y => parseInt(y, 10))) || new Date().getFullYear();
        const newYear = (latestYear + 1).toString();

        setIsLoadingYears(true);
        try {
            await api.payments.addNewYear(newYear);

            // Success - refresh years and switch to the new year
            await fetchUserYears(true);
            setCurrentYear(newYear);
            localStorage.setItem('currentYear', newYear);

            alert(`Year ${newYear} added successfully!`);
        } catch (error) {
            const errorMessage = error?.response?.data?.error || `Failed to add year ${newYear}.`;

            if (errorMessage.includes('already exists')) {
                await fetchUserYears(true);
                setCurrentYear(newYear);
                localStorage.setItem('currentYear', newYear);
                alert(`Year ${newYear} already exists. Switched to that year.`);
            } else {
                alert(errorMessage);
            }
        } finally {
            setIsLoadingYears(false);
        }
    }, [availableYears, fetchUserYears]);

    return (
        <div>
            {/* Header with Add New Year button and Year dropdown - matching dashboard style */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleAddNewYear}
                        className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-200 flex items-center"
                        disabled={isLoadingYears}
                    >
                        <i className="fas fa-calendar-plus mr-2"></i>
                        {isLoadingYears ? "Loading..." : "Add New Year"}
                    </button>
                </div>

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