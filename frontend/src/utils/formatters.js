export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || amount === '') {
    return '-';
  }
  
  const num = parseFloat(amount);
  if (isNaN(num)) {
    return '-';
  }
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
};

export const formatDate = (date) => {
  if (!date) return '-';
  
  try {
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (error) {
    return '-';
  }
};

export const formatNumber = (num) => {
  if (num === null || num === undefined || num === '') {
    return '-';
  }
  
  const number = parseFloat(num);
  if (isNaN(number)) {
    return '-';
  }
  
  return new Intl.NumberFormat('en-IN').format(number);
}; 