import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import api from '../../api'; 

const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";

const RemarkPopup = ({ 
  isOpen, 
  onClose, 
  clientName, 
  type, 
  month, 
  currentRemark = "N/A", 
  year, 
  sessionToken,
  onRemarkSaved 
}) => {
  const [remark, setRemark] = useState(currentRemark);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const popupRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    setRemark(currentRemark);
    setIsEditing(false);
    setError('');
  }, [currentRemark, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (remark.trim() === '') {
      setRemark('N/A');
    }

    setIsSaving(true);
    setError('');

    try {
      // Use the centralized api service
        const remarkData = {
            clientName,
            type,
            month,
            remark: remark.trim() === '' ? 'N/A' : remark.trim()
        };
        
        await api.payments.saveRemark(remarkData, year);

      setIsEditing(false);
      onRemarkSaved && onRemarkSaved(remark.trim() === '' ? 'N/A' : remark.trim());
    } catch (error) {
      console.error('Failed to save remark:', error);
      setError(error.response?.data?.error || 'Failed to save remark');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setRemark(currentRemark);
    setIsEditing(false);
    setError('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div 
        ref={popupRef}
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Remark for {clientName}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            <span className="font-medium">Month:</span> {month.charAt(0).toUpperCase() + month.slice(1)}
          </p>
          <p className="text-sm text-gray-600 mb-2">
            <span className="font-medium">Type:</span> {type}
          </p>
        </div>

        {!isEditing ? (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Current Remark:
              </label>
              <button
                onClick={() => setIsEditing(true)}
                className="text-blue-600 hover:text-blue-800 transition-colors"
                title="Edit remark"
              >
                <i className="fas fa-edit"></i>
              </button>
            </div>
            <div className="bg-gray-50 p-3 rounded-md border">
              <p className="text-gray-900 whitespace-pre-wrap">
                {currentRemark}
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Edit Remark:
            </label>
            <textarea
              ref={textareaRef}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows="4"
              placeholder="Enter your remark here..."
              maxLength="500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Press Ctrl+Enter to save, Esc to cancel
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {isEditing && (
          <div className="flex justify-end space-x-3">
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RemarkPopup;
