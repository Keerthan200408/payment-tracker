import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';

// ASSUMPTION: These page components exist in the 'src/pages/' directory.
import SignInPage from './pages/SignInPage';
import DashboardPage from './pages/DashboardPage';
import AddClientPage from './pages/AddClientPage';
import ClientsPage from './pages/ClientsPage';
import PaymentsPage from './pages/PaymentsPage';

// ASSUMPTION: These common components exist in 'src/components/common/'.
import LoadingSkeleton from './components/common/LoadingSkeleton';
import SessionTimer from './components/common/SessionTimer';

const App = () => {
    const { sessionToken, currentUser, isInitialized, logout } = useAuth();
    const { fetchClients, fetchTypes } = useData();

    // UI State for navigation and editing
    const [page, setPage] = useState(() => localStorage.getItem("currentPage") || "home");
    const [editClient, setEditClient] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef(null);

    // Initial data fetch when a user is authenticated
    useEffect(() => {
        if (sessionToken && currentUser) {
            fetchTypes();
            fetchClients();
        }
    }, [sessionToken, currentUser, fetchTypes, fetchClients]);

    // Persist the current page to local storage
    useEffect(() => {
        if (page !== 'signIn') {
            localStorage.setItem("currentPage", page);
        }
    }, [page]);

    // Effect to close profile menu when clicking outside of it
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Show a loading spinner until the app has checked for a stored session
    if (!isInitialized) {
        return <div className="flex items-center justify-center min-h-screen"><LoadingSkeleton type="spinner" /></div>;
    }

    // If no user session, render the sign-in page
    if (!sessionToken) {
        return <SignInPage />;
    }

    // Simple router to render the correct page component
    const renderPage = () => {
        switch (page) {
            case "clients":
                return <ClientsPage setPage={setPage} setEditClient={setEditClient} />;
            case "addClient":
                return <AddClientPage setPage={setPage} editClient={editClient} setEditClient={setEditClient} />;
            case "payments":
                return <PaymentsPage />;
            // Add a "reports" page here in the future if needed
            case "home":
            default:
                return <DashboardPage setPage={setPage} />;
        }
    };

    return (
        <>
            <SessionTimer />
            <div className="min-h-screen bg-gray-50">
                <div className="flex flex-col sm:flex-row">
                    {/* --- Mobile Header --- */}
                    <header className="bg-white shadow-sm w-full p-4 sm:hidden flex justify-between items-center border-b border-gray-200 fixed top-0 z-40">
                        <div className="flex items-center">
                            <i className="fas fa-money-bill-wave text-2xl mr-2 text-gray-800"></i>
                            <h1 className="text-xl font-semibold text-gray-800">Payment Tracker</h1>
                        </div>
                        <button onClick={() => setIsSidebarOpen(true)} className="text-gray-800 focus:outline-none">
                            <i className="fas fa-bars text-2xl"></i>
                        </button>
                    </header>

                    {/* --- Sidebar Navigation --- */}
                    <nav className={`bg-white shadow-lg w-64 p-4 fixed top-0 left-0 h-full border-r border-gray-200 z-50 transition-transform transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} sm:translate-x-0`}>
                        <div className="flex items-center justify-between sm:justify-start mb-6 pb-4 border-b border-gray-200">
                             <div className="flex items-center">
                                <i className="fas fa-money-bill-wave text-2xl mr-2 text-gray-800"></i>
                                <h1 className="text-xl font-semibold text-gray-800">Payment Tracker</h1>
                            </div>
                            <button onClick={() => setIsSidebarOpen(false)} className="sm:hidden text-gray-600 hover:text-gray-900">
                                <i className="fas fa-times text-2xl"></i>
                            </button>
                        </div>
                        <ul className="space-y-1">
                             {['home', 'clients', 'payments'].map((p) => (
                                <li key={p}>
                                    <button onClick={() => { setPage(p); setIsSidebarOpen(false); }}
                                        className={`w-full text-left p-3 rounded-lg flex items-center transition-colors ${page === p ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700 hover:bg-gray-100"}`}>
                                        <i className={`fas ${p === 'home' ? 'fa-tachometer-alt' : p === 'clients' ? 'fa-users' : 'fa-money-bill-wave'} mr-3 w-4`}></i>
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </button>
                                </li>
                            ))}
                             <li className="absolute bottom-4 w-56">
                                <button onClick={logout} className="w-full text-left p-3 rounded-lg flex items-center transition-colors text-red-600 hover:bg-red-50">
                                    <i className="fas fa-sign-out-alt mr-3 w-4"></i> Logout
                                </button>
                            </li>
                        </ul>
                    </nav>

                    {/* --- Main Content Area --- */}
                    <main className="flex-1 sm:ml-64 mt-20 sm:mt-0">
                         <header className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm m-6">
                           <div>
                                <h1 className="text-2xl font-bold text-gray-900 capitalize">{page === 'addClient' ? (editClient ? 'Edit Client' : 'Add Client') : page}</h1>
                                <p className="text-gray-600 text-sm">Welcome back, {currentUser}!</p>
                           </div>
                           <div className="relative" ref={profileMenuRef}>
                               <button onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="focus:outline-none p-2 rounded-full hover:bg-gray-100 transition-colors">
                                   <i className="fas fa-user-circle text-3xl text-gray-700"></i>
                               </button>
                               {isProfileMenuOpen && (
                                   <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                                       <div className="p-4 border-b border-gray-100">
                                           <p className="font-semibold text-gray-900">{currentUser}</p>
                                       </div>
                                       <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Logout</button>
                                   </div>
                               )}
                           </div>
                       </header>
                        <div className="px-6 pb-6">
                            {renderPage()}
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
};

export default App;