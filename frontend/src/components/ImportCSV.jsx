import { useState, useEffect } from 'react';
import axios from 'axios';
import Papa from 'papaparse';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const ImportCSV = () => {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError('');
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a CSV file.');
      return;
    }
    setIsLoading(true);
    try {
      Papa.parse(file, {
        complete: async (result) => {
          const csvData = result.data
            .filter(row => row.Client_Name && row.Type && row.Amount_To_Be_Paid)
            .map(row => ({
              Client_Name: row.Client_Name,
              Type: row.Type,
              Amount_To_Be_Paid: parseFloat(row.Amount_To_Be_Paid),
            }));
          await axios.post(`${BASE_URL}/api/import-csv`, csvData, {
            withCredentials: true,
          });
          setFile(null);
          alert('CSV imported successfully!');
        },
        header: true,
        skipEmptyLines: true,
      });
    } catch (error) {
      console.error('Import CSV error:', error);
      setError(error.response?.data?.error || 'Error importing CSV. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Import CSV</h2>
      {error && <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-lg">{error}</div>}
      <div className="mb-4">
        <label className="block mb-1">Select CSV File</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="w-full p-2 border rounded-lg"
          disabled={isLoading}
        />
      </div>
      <button
        onClick={handleSubmit}
        className="w-full p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        disabled={isLoading}
      >
        {isLoading ? 'Importing...' : 'Import CSV'}
      </button>
    </div>
  );
};

export default ImportCSV;
