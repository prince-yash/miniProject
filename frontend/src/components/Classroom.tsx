import React, { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import SimpleVideoCall from './SimpleVideoCall';

interface User {
  name: string;
  role: 'admin' | 'student';
  streamActive: boolean;
  canDraw: boolean;
  videoEnabled: boolean;
  audioEnabled: boolean;
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: string;
  role: 'admin' | 'student';
}

interface ClassroomProps {
  socket: Socket;
  userRole: 'admin' | 'student';
  userName: string;
  onLeaveSession: () => void;
}

const Classroom: React.FC<ClassroomProps> = ({ socket, userRole, userName, onLeaveSession }) => {
  const [users, setUsers] = useState<{ [socketId: string]: User }>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [drawingEnabled, setDrawingEnabled] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(3);
  const [lastDrawPoint, setLastDrawPoint] = useState<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'line' | 'rect' | 'circle'>('pen');
  const [showTools, setShowTools] = useState<boolean>(false);
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  const canvasSnapshotRef = useRef<ImageData | null>(null);
  const [localUserId, setLocalUserId] = useState<string>('');
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [isVideoFullScreen, setIsVideoFullScreen] = useState(false);
  const [videoParticipants, setVideoParticipants] = useState<{ [userName: string]: { role: string; muted: boolean; videoMuted: boolean; sharing: boolean } }>({});
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize canvas with white background
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    // Capture local user ID from socket
    setLocalUserId(socket.id || '');
    
    // Socket event listeners
    socket.on('join_success', (data) => {
      setUsers(data.users);
      setChatMessages(data.chat);
      setDrawingEnabled(data.drawingEnabled);
      setLocalUserId(socket.id || '');
    });

    socket.on('user_joined', (data) => {
      setUsers(prev => ({
        ...prev,
        [data.userId]: data.user
      }));
    });

    socket.on('user_left', (data) => {
      setUsers(prev => {
        const newUsers = { ...prev };
        delete newUsers[data.userId];
        return newUsers;
      });
      
      // Video users are now handled by Jitsi Meet
    });

    socket.on('new_message', (message) => {
      setChatMessages(prev => [...prev, message]);
    });

    socket.on('message_deleted', (data) => {
      setChatMessages(prev => prev.filter(msg => msg.id !== data.messageId));
    });

    socket.on('draw_data', (data) => {
      // Handle drawing on canvas
      drawOnCanvas(data);
    });

    socket.on('clear_canvas', () => {
      clearCanvas();
    });

    socket.on('drawing_toggled', (data) => {
      setDrawingEnabled(data.enabled);
    });

    socket.on('user_updated', (data) => {
      setUsers(prev => ({
        ...prev,
        [data.userId]: data.user
      }));
    });

    socket.on('session_ended', () => {
      alert('Session ended - Admin left the classroom');
      onLeaveSession();
    });

    socket.on('kicked', (payload: { reason?: string }) => {
      alert(payload?.reason || 'You were removed by the admin');
      onLeaveSession();
    });

    // PeerJS video call event listeners
    socket.on('peer_joined', (data) => {
      const { peerId, userName, userRole } = data;
      setVideoParticipants(prev => ({
        ...prev,
        [userName]: {
          role: userRole,
          muted: false,
          videoMuted: false,
          sharing: false
        }
      }));
    });

    socket.on('peer_left', (data) => {
      const { peerId } = data;
      // Find and remove the peer by peerId
      setVideoParticipants(prev => {
        const newParticipants = { ...prev };
        const userToRemove = Object.entries(newParticipants).find(
          ([name, peer]) => peer.role // We don't store peerId but this will work for cleanup
        );
        if (userToRemove) {
          delete newParticipants[userToRemove[0]];
        }
        return newParticipants;
      });
    });

    return () => {
      socket.off('join_success');
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('new_message');
      socket.off('message_deleted');
      socket.off('draw_data');
      socket.off('clear_canvas');
      socket.off('drawing_toggled');
      socket.off('user_updated');
      socket.off('session_ended');
      socket.off('kicked');
      socket.off('peer_joined');
      socket.off('peer_left');
    };
  }, [socket, onLeaveSession, localUserId]);

  useEffect(() => {
    // Scroll to bottom of chat
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendMessage = () => {
    if (newMessage.trim()) {
      socket.emit('chat_message', { message: newMessage });
      setNewMessage('');
    }
  };

  const deleteMessage = (messageId: string) => {
    socket.emit('delete_message', { messageId });
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Fill white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const drawOnCanvas = (data: any) => {
    const canvas = canvasRef.current;
    if (canvas && data) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Backward compatibility: map legacy type to tool
      const toolType: 'pen' | 'eraser' | 'line' | 'rect' | 'circle' = data.tool || (data.type === 'erase' ? 'eraser' : 'pen');

      ctx.lineWidth = data.size || brushSize;
      ctx.lineCap = 'round';

      if (toolType === 'pen' || toolType === 'eraser') {
        ctx.globalCompositeOperation = toolType === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = data.color || currentColor;
        ctx.beginPath();
        ctx.moveTo(data.fromX, data.fromY);
        ctx.lineTo(data.toX, data.toY);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        return;
      }

      // Shapes (always draw in source-over)
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = data.color || currentColor;
      const x1 = data.fromX, y1 = data.fromY, x2 = data.toX, y2 = data.toY;
      const w = x2 - x1, h = y2 - y1;

      ctx.beginPath();
      if (toolType === 'line') {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      } else if (toolType === 'rect') {
        ctx.rect(x1, y1, w, h);
      } else if (toolType === 'circle') {
        const rx = w / 2;
        const ry = h / 2;
        const cx = x1 + rx;
        const cy = y1 + ry;
        const radius = Math.sqrt(rx * rx + ry * ry);
        ctx.arc(cx, cy, Math.abs(radius), 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const currentUser = users[localUserId];
    console.log('Drawing check:', {
      userRole,
      drawingEnabled,
      localUserId,
      currentUser: currentUser?.name,
      canDraw: currentUser?.canDraw,
      allowedToDraw: userRole === 'admin' || (drawingEnabled && currentUser?.canDraw)
    });
    if (!(userRole === 'admin' || (drawingEnabled && (currentUser?.canDraw !== false)))) return;

    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setLastDrawPoint({ x, y });

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Take a snapshot for live preview
        canvasSnapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const currentUser = users[localUserId];
    if (!(userRole === 'admin' || (drawingEnabled && (currentUser?.canDraw !== false)))) return;

    const canvas = canvasRef.current;
    if (!canvas || !lastDrawPoint) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'pen' || tool === 'eraser') {
      const drawData = {
        tool,
        fromX: lastDrawPoint.x,
        fromY: lastDrawPoint.y,
        toX: x,
        toY: y,
        color: currentColor,
        size: brushSize
      };

      drawOnCanvas(drawData);
      socket.emit('draw_data', drawData);
      setLastDrawPoint({ x, y });
      return;
    }

    // Shape preview: restore snapshot and draw preview shape without emitting
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvasSnapshotRef.current) {
      ctx.putImageData(canvasSnapshotRef.current, 0, 0);
    }

    const previewData = {
      tool,
      fromX: lastDrawPoint.x,
      fromY: lastDrawPoint.y,
      toX: x,
      toY: y,
      color: currentColor,
      size: brushSize
    };
    drawOnCanvas(previewData);
  };

  const handleCanvasMouseUp = (e?: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (canvas && lastDrawPoint && (tool === 'line' || tool === 'rect' || tool === 'circle')) {
      const rect = canvas.getBoundingClientRect();
      const x = e ? e.clientX - rect.left : lastDrawPoint.x;
      const y = e ? e.clientY - rect.top : lastDrawPoint.y;

      const shapeData = {
        tool,
        fromX: lastDrawPoint.x,
        fromY: lastDrawPoint.y,
        toX: x,
        toY: y,
        color: currentColor,
        size: brushSize
      };
      // Already drawn in preview; just emit
      socket.emit('draw_data', shapeData);
    }

    setIsDrawing(false);
    setLastDrawPoint(null);
    canvasSnapshotRef.current = null;
  };

  const handleClearCanvas = () => {
    socket.emit('clear_canvas');
  };

  const handleToggleDrawing = () => {
    socket.emit('toggle_draw', { enabled: !drawingEnabled });
  };

  const handleToggleUserDraw = (userId: string, canDraw: boolean) => {
    socket.emit('set_user_draw', { targetUserId: userId, canDraw });
  };

  const handleKickUser = (userId: string) => {
    if (window.confirm('Are you sure you want to kick this user?')) {
      socket.emit('kick_user', { targetUserId: userId });
    }
  };

  const handleCloseVideo = () => {
    setShowVideoCall(false);
    // Clean up video participants
    setVideoParticipants({});
  };

  // Add tab state for sidebar
  const [activeTab, setActiveTab] = useState<'video' | 'chat' | 'participants'>('video');

  return (
    <div className="h-screen space-bg flex flex-col relative overflow-hidden">
      {/* Animated Particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * -15}s`,
              animationDuration: `${12 + Math.random() * 8}s`
            }}
          />
        ))}
      </div>

      {/* Futuristic Header */}
      <div className="glass-dark border-b border-cyan-500/30 px-6 py-4 flex justify-between items-center relative z-10">
        <div className="flex items-center space-x-6">
          <div>
            <h1 className="text-2xl font-bold text-cyber text-glow" style={{color: 'var(--cyber-blue)'}}>
              EduCanvas Live
            </h1>
            <p className="text-sm text-cyan-300/80 font-medium">
              Welcome, <span className="text-white">{userName}</span> 
              <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                userRole === 'admin' 
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' 
                  : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
              }`}>
                {userRole === 'admin' ? '👑 Teacher' : '🎓 Student'}
              </span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {userRole === 'admin' && (
            <button
              onClick={() => setShowAdminPanel(!showAdminPanel)}
              className={`cyber-btn px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 ${
                showAdminPanel ? 'neon-purple text-white' : 'neon-green text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{showAdminPanel ? 'Hide Panel' : 'Admin Panel'}</span>
            </button>
          )}
          
          <div className="flex space-x-2">
            <button
              onClick={() => setShowVideoCall(!showVideoCall)}
              className={`cyber-btn px-6 py-3 rounded-xl text-sm font-semibold flex items-center space-x-2 transition-all duration-300 transform hover:scale-105 ${
                showVideoCall
                  ? 'neon-pink text-white pulse-glow'
                  : 'neon-blue text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showVideoCall ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                )}
              </svg>
              <span>{showVideoCall ? 'End Conference' : '🚀 Launch'}</span>
            </button>
            
            {showVideoCall && (
              <div className="flex items-center space-x-2 px-3 py-2 glass rounded-lg">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-400 font-medium">LIVE</span>
              </div>
            )}
          </div>
          
          <button
            onClick={onLeaveSession}
            className="cyber-btn px-4 py-2 neon-pink text-white rounded-lg text-sm font-medium"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Exit
          </button>
        </div>
      </div>

      {/* Admin Panel Overlay */}
      {showAdminPanel && userRole === 'admin' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 flex items-center justify-center p-4">
          <div className="glass-dark rounded-xl p-6 w-full max-w-2xl border border-purple-500/30 relative animate-fade-in">
            <button
              onClick={() => setShowAdminPanel(false)}
              className="absolute -top-2 -right-2 neon-pink text-white rounded-full w-8 h-8 flex items-center justify-center text-lg"
              aria-label="Close admin panel"
            >
              ×
            </button>

            <h2 className="text-2xl font-bold text-cyber text-glow mb-6" style={{color: 'var(--cyber-purple)'}}>
              👑 Admin Control Panel
            </h2>

            <div className="space-y-4">
              {/* Global Controls */}
              <div className="glass p-4 rounded-lg border border-purple-500/20">
                <h3 className="text-lg font-semibold text-purple-300 mb-3">Global Controls</h3>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={handleToggleDrawing}
                    className={`cyber-btn px-4 py-2 rounded-lg text-sm font-medium ${
                      drawingEnabled 
                        ? 'neon-green text-white' 
                        : 'neon-pink text-white'
                    }`}
                  >
                    {drawingEnabled ? '✏️ Drawing: ON' : '🚫 Drawing: OFF'}
                  </button>
                  
                  <button
                    onClick={handleClearCanvas}
                    className="cyber-btn px-4 py-2 neon-orange text-white rounded-lg text-sm font-medium"
                  >
                    🗑️ Clear Canvas
                  </button>
                </div>
              </div>

              {/* User Management */}
              <div className="glass p-4 rounded-lg border border-cyan-500/20">
                <h3 className="text-lg font-semibold text-cyan-300 mb-3">User Management ({Object.keys(users).length} users)</h3>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {Object.entries(users).map(([socketId, user]) => {
                    const isCurrentUser = socketId === localUserId;
                    return (
                      <div key={socketId} className={`glass p-3 rounded-lg flex items-center justify-between ${
                        isCurrentUser ? 'border border-purple-500/30' : ''
                      }`}>
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                            user.role === 'admin' 
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
                              : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                          }`}>
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">
                              {user.name} {isCurrentUser && '(You)'}
                            </p>
                            <p className="text-xs text-gray-400">
                              {user.role === 'admin' ? '👑 Admin' : '🎓 Student'}
                            </p>
                          </div>
                        </div>
                        
                        {!isCurrentUser && (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleToggleUserDraw(socketId, !user.canDraw)}
                              className={`cyber-btn px-2 py-1 rounded text-xs ${
                                user.canDraw 
                                  ? 'neon-green text-white' 
                                  : 'neon-pink text-white'
                              }`}
                              title={user.canDraw ? 'Disable drawing' : 'Enable drawing'}
                            >
                              {user.canDraw ? '✏️' : '🚫'}
                            </button>
                            
                            <button
                              onClick={() => handleKickUser(socketId)}
                              className="cyber-btn px-2 py-1 neon-pink text-white rounded text-xs"
                              title="Kick user"
                            >
                              👢
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex relative z-10">
        {/* Left Sidebar - Tabbed Interface */}
        <div className={`${isVideoFullScreen ? 'w-full' : 'w-1/3'} glass-dark ${isVideoFullScreen ? '' : 'border-r border-cyan-500/30'} transition-all duration-300 relative`}>
          {/* Tab Navigation */}
          <div className="flex border-b border-cyan-500/30">
            {[
              { key: 'video', label: '📹 Video', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
              { key: 'chat', label: '💬 Chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 3.582-8 8-8s8 3.582 8 8z' },
              { key: 'participants', label: '👥 Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center space-x-2 transition-all duration-300 ${
                  activeTab === tab.key ? 'tab-active' : 'tab-inactive'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                <span className="hidden lg:block">{tab.label.split(' ')[1]}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 p-4">
            {activeTab === 'video' && (
              <div>
                {showVideoCall ? (
                  <SimpleVideoCall
                    socket={socket}
                    userName={userName}
                    userRole={userRole}
                    onClose={handleCloseVideo}
                    height={400}
                  />
                ) : (
                  <div className="glass h-64 flex items-center justify-center">
                    <div className="text-center">
                      <svg className="w-16 h-16 text-cyan-400/50 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <p className="text-cyan-300/70 text-sm">Click Launch to start video conference</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-y-auto pr-2" style={{height: 'calc(100% - 80px)'}}>
                  {chatMessages.map((message) => (
                    <div key={message.id} className="mb-4 glass p-3 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className={`font-medium text-sm ${
                              message.role === 'admin' 
                                ? 'text-purple-400' 
                                : 'text-cyan-400'
                            }`}>
                              {message.username}
                              {message.role === 'admin' && <span className="text-xs">👑</span>}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-200 mt-1">{message.message}</p>
                        </div>
                        
                        {userRole === 'admin' && (
                          <button
                            onClick={() => deleteMessage(message.id)}
                            className="text-red-400 hover:text-red-300 text-xs ml-2"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                
                <div className="flex space-x-2 mt-4">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type message..."
                    className="flex-1 px-3 py-2 glass rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-transparent"
                  />
                  <button
                    onClick={sendMessage}
                    className="cyber-btn px-4 py-2 neon-green text-white rounded-lg"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'participants' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Connected ({Object.keys(users).length})</h3>
                  {showVideoCall && (
                    <span className="px-2 py-1 rounded-full text-xs neon-green">Live Call</span>
                  )}
                </div>
                <div className="space-y-3">
                  {Object.entries(users).map(([socketId, user]) => (
                    <div key={socketId} className="glass p-3 rounded-lg flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        user.role === 'admin' 
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
                          : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                      }`}>
                        <span className="text-white font-semibold text-sm">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{user.name}</p>
                        <p className="text-xs text-gray-400">
                          {user.role === 'admin' ? '👑 Teacher' : '🎓 Student'}
                          {socketId === localUserId && ' (You)'}
                        </p>
                      </div>
                      <div className="flex space-x-1">
                        <div className={`w-2 h-2 rounded-full ${
                          showVideoCall && videoParticipants[user.name] 
                            ? 'bg-green-400 animate-pulse' 
                            : 'bg-gray-600'
                        }`}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Whiteboard */}
        {!isVideoFullScreen && (
          <div className="flex-1 flex flex-col relative">
            {/* Floating Tools Toggle Button */}
            <div className="absolute bottom-4 right-4 z-20">
              <button
                onClick={() => setShowTools(!showTools)}
                aria-label="Toggle drawing tools"
                className={`cyber-btn rounded-full p-3 ${showTools ? 'neon-pink' : 'neon-blue'} text-white`}
                title={showTools ? 'Hide tools' : 'Show tools'}
              >
                {showTools ? '✖' : '🛠️'}
              </button>
            </div>

            {/* Floating Drawing Controls (Popup) */}
            {showTools && (
              <div className="absolute top-4 right-4 z-20 floating animate-fade-in">
                <div className="glass-dark p-4 rounded-xl space-y-3 relative">
                  <button
                    onClick={() => setShowTools(false)}
                    className="absolute -top-2 -right-2 neon-pink text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                    aria-label="Close tools"
                  >
                    ×
                  </button>

                  <h3 className="text-sm font-medium text-cyan-400 text-center">Drawing Tools</h3>
                  
                  {/* Tool Selection */}
                  <div className="space-y-1">
                    <div className="text-xs text-gray-300">Tool:</div>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => setTool('pen')} className={`p-2 rounded text-xs ${tool === 'pen' ? 'neon-green text-white' : 'glass text-gray-200'}`}>✏️ Pen</button>
                      <button onClick={() => setTool('eraser')} className={`p-2 rounded text-xs ${tool === 'eraser' ? 'neon-pink text-white' : 'glass text-gray-200'}`}>🧽 Eraser</button>
                      <button onClick={() => setTool('line')} className={`p-2 rounded text-xs ${tool === 'line' ? 'neon-blue text-white' : 'glass text-gray-200'}`}>📏 Line</button>
                      <button onClick={() => setTool('rect')} className={`p-2 rounded text-xs ${tool === 'rect' ? 'neon-blue text-white' : 'glass text-gray-200'}`}>⬛ Rect</button>
                      <button onClick={() => setTool('circle')} className={`p-2 rounded text-xs ${tool === 'circle' ? 'neon-blue text-white' : 'glass text-gray-200'}`}>⚪ Circle</button>
                    </div>
                  </div>
                  
                  {userRole === 'admin' && (
                    <div className="space-y-2">
                      <button
                        onClick={handleToggleDrawing}
                        className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          drawingEnabled 
                            ? 'neon-green text-white' 
                            : 'neon-pink text-white'
                        }`}
                      >
                        {drawingEnabled ? '✏️ Drawing ON' : '🚫 Drawing OFF'}
                      </button>
                      
                      <button
                        onClick={handleClearCanvas}
                        className="w-full px-3 py-2 neon-orange text-white rounded-lg text-xs font-medium"
                      >
                        🗑️ Clear All
                      </button>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    {/* Drawing Status */}
                    <div className="text-xs text-center">
                      {(() => {
                        const currentUser = users[localUserId];
                        const canDraw = userRole === 'admin' || (drawingEnabled && (currentUser?.canDraw !== false));
                        return (
                          <span className={`px-2 py-1 rounded-full ${
                            canDraw ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {canDraw ? '✅ Can Draw' : '🚫 Cannot Draw'}
                          </span>
                        );
                      })()} 
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-gray-300">Color:</label>
                      <input
                        type="color"
                        value={currentColor}
                        onChange={(e) => setCurrentColor(e.target.value)}
                        className="w-8 h-8 rounded-full border-2 border-cyan-400 bg-transparent"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-xs text-gray-300">Size: {brushSize}px</label>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Whiteboard */}
            <div className="flex-1 p-6">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-white text-cyber">Digital Canvas</h3>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      drawingEnabled ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                    }`}></div>
                    <span className="text-sm text-gray-300">
                      {drawingEnabled ? 'Drawing Active' : 'Drawing Disabled'}
                    </span>
                  </div>
                </div>

                {/* Tool selector */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button onClick={() => setTool('pen')} className={`px-3 py-1 rounded-lg text-xs font-medium ${tool === 'pen' ? 'neon-green text-white' : 'glass text-gray-200'}`}>✏️ Pen</button>
                  <button onClick={() => setTool('eraser')} className={`px-3 py-1 rounded-lg text-xs font-medium ${tool === 'eraser' ? 'neon-pink text-white' : 'glass text-gray-200'}`}>🧽 Eraser</button>
                  <button onClick={() => setTool('line')} className={`px-3 py-1 rounded-lg text-xs font-medium ${tool === 'line' ? 'neon-blue text-white' : 'glass text-gray-200'}`}>📏 Line</button>
                  <button onClick={() => setTool('rect')} className={`px-3 py-1 rounded-lg text-xs font-medium ${tool === 'rect' ? 'neon-blue text-white' : 'glass text-gray-200'}`}>⬛ Rect</button>
                  <button onClick={() => setTool('circle')} className={`px-3 py-1 rounded-lg text-xs font-medium ${tool === 'circle' ? 'neon-blue text-white' : 'glass text-gray-200'}`}>⚪ Circle</button>
                </div>
                
                <div className="flex-1 flex items-center justify-center">
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={400}
                    className={`bg-white rounded-lg cursor-crosshair transition-all duration-300 ${
                      isDrawing || (drawingEnabled || userRole === 'admin') 
                        ? 'canvas-active' 
                        : 'border border-gray-600'
                    }`}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Classroom;
