import React, { useState, useEffect } from 'react';
// If you see errors about 'process', make sure to set REACT_APP_BACKEND_URL in your environment and install @types/node as a dev dependency.
import { io, Socket } from 'socket.io-client';
import LandingPage from './components/LandingPage';
import Classroom from './components/Classroom';

interface AppState {
  socket: Socket | null;
  isConnected: boolean;
  inClassroom: boolean;
  userRole: 'admin' | 'student';
  userName: string;
  error: string | null;
}

function App() {
  // If you see errors about JSX, make sure you have @types/react and @types/react-dom installed.
  const [state, setState] = useState<AppState>({
    socket: null,
    isConnected: false,
    inClassroom: false,
    userRole: 'student',
    userName: '',
    error: null
  });

  const connectSocket = () => {
  // On Render, set REACT_APP_BACKEND_URL in the frontend's environment variables to your backend Render service URL
  // Fallback to local dev if not set
  const host = window.location.hostname;
  const protocol = window.location.protocol === 'https:' ? 'https' : 'https'; // Force HTTPS
  const backendUrl = (process.env.REACT_APP_BACKEND_URL || `${protocol}://${host}:5000`).replace(/\/$/, '');

    const newSocket = io(backendUrl, {
      // Accept self-signed certificates
      rejectUnauthorized: false
    });
    
    newSocket.on('connect', () => {
      console.log('Connected to server', backendUrl);
      setState(prev => ({ ...prev, socket: newSocket, isConnected: true }));
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setState(prev => ({ ...prev, isConnected: false }));
    });

    newSocket.on('join_success', (data) => {
      setState(prev => ({
        ...prev,
        inClassroom: true,
        userRole: data.role,
        error: null
      }));
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection failed:', error);
      setState(prev => ({ ...prev, error: 'Failed to connect to server. Make sure the backend is running.' }));
    });

    return newSocket;
  };

  const handleJoinClassroom = (name: string, adminCode?: string) => {
    setState(prev => ({ ...prev, userName: name, error: null }));
    
    let socket = state.socket;
    if (!socket || !socket.connected) {
      socket = connectSocket();
    }

    // Wait for connection then join room
    const joinRoom = () => {
      if (socket && socket.connected) {
        socket.emit('join_room', { name, adminCode });
      } else {
        setTimeout(joinRoom, 100);
      }
    };
    
    joinRoom();
  };

  const handleLeaveSession = () => {
    if (state.socket) {
      state.socket.disconnect();
    }
    setState({
      socket: null,
      isConnected: false,
      inClassroom: false,
      userRole: 'student',
      userName: '',
      error: null
    });
  };

  useEffect(() => {
    return () => {
      if (state.socket) {
        state.socket.disconnect();
      }
    };
  }, [state.socket]);

  if (state.error) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-6">{state.error}</p>
          <button
            onClick={() => setState(prev => ({ ...prev, error: null }))}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!state.inClassroom) {
    return <LandingPage onJoinClassroom={handleJoinClassroom} />;
  }

  if (state.socket && state.inClassroom) {
    return (
      <Classroom
        socket={state.socket}
        userRole={state.userRole}
        userName={state.userName}
        onLeaveSession={handleLeaveSession}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Connecting to classroom...</p>
      </div>
    </div>
  );
}

export default App;
