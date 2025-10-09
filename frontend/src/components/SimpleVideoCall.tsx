import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import Peer from 'peerjs';

// Global peer instance to prevent duplicates
let globalPeer: Peer | null = null;
let globalStream: MediaStream | null = null;
let globalPeerId: string | null = null;
let isInitializing = false;

interface SimpleVideoCallProps {
  socket: Socket;
  userName: string;
  userRole: 'admin' | 'student';
  onClose: () => void;
  fullHeight?: boolean;
  height?: number; // when not full height, use a fixed height (px)
}

interface ConnectedPeer {
  id: string;
  name: string;
  stream?: MediaStream;
  call?: any;
}

const SimpleVideoCall: React.FC<SimpleVideoCallProps> = ({
  socket,
  userName,
  userRole,
  onClose,
  fullHeight = false,
  height = 320
}) => {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<{ [id: string]: ConnectedPeer }>({});
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [audioAllowed, setAudioAllowed] = useState<boolean>(true); // allow audio by default
  const [hasRemoteAudio, setHasRemoteAudio] = useState<boolean>(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<{ [id: string]: HTMLVideoElement | null }>({});
  const initializedRef = useRef<boolean>(false);

  // Initialize PeerJS and local media
  useEffect(() => {
    if (initializedRef.current || globalPeer || isInitializing) {
      // Use existing global peer
      if (globalPeer && globalStream) {
        setPeer(globalPeer);
        setLocalStream(globalStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = globalStream;
        }
        setIsLoading(false);
      }
      return;
    }
    initializedRef.current = true;
    isInitializing = true;
    
    console.log('Initializing peer for:', userName);
    const initializePeer = async () => {
      try {
        setIsLoading(true);
        
        // Get user media first
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        globalStream = stream;
        setLocalStream(stream);
        
        // Set up local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Initialize PeerJS with local signaling server on same HTTPS port
        const host = window.location.hostname;
        const peerInstance = new Peer({
          host,
          port: 5000,
          path: '/peerjs',
          secure: true,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        globalPeer = peerInstance;

        peerInstance.on('open', (id) => {
          console.log('My peer ID is:', id);
          setMyPeerId(id);
          setPeer(peerInstance);
          setIsLoading(false);
          isInitializing = false;
          
          // Only emit if this is a new peer ID
          if (globalPeerId !== id) {
            globalPeerId = id;
            socket.emit('peer_ready', { peerId: id });
          }
        });

        peerInstance.on('call', (call) => {
          console.log('Receiving call from:', call.peer);
          call.answer(stream);
          
          call.on('stream', (remoteStream) => {
            console.log('Received stream from:', call.peer);
            setConnectedPeers(prev => ({
              ...prev,
              [call.peer]: {
                ...prev[call.peer],
                stream: remoteStream,
                call
              }
            }));
            
            setHasRemoteAudio(true);
            // Set remote video
            const videoElement = remoteVideosRef.current[call.peer];
            if (videoElement) {
              videoElement.srcObject = remoteStream;
              videoElement.playsInline = true;
              videoElement.muted = false; // Enable audio
              videoElement.play().catch((e) => {
                console.log('Autoplay blocked:', e);
              });
            }
          });
          
          call.on('close', () => {
            console.log('Call closed with:', call.peer);
            setConnectedPeers(prev => {
              const newPeers = { ...prev };
              delete newPeers[call.peer];
              return newPeers;
            });
          });
        });

        peerInstance.on('error', (err) => {
          console.error('Peer error:', err);
          setError(`Connection error: ${err.message}`);
        });

        peerInstance.on('disconnected', () => {
          console.log('Peer disconnected');
        });

      } catch (error) {
        console.error('Failed to initialize video call:', error);
        setError(`Failed to access camera/microphone: ${error}`);
        setIsLoading(false);
        isInitializing = false;
      }
    };

    initializePeer();

    return () => {
      console.log('Cleaning up peer for:', userName);
      // Don't reset global state on cleanup in dev mode
      // initializedRef.current = false;
      // isInitializing = false;
    };
  }, []);

  // Handle socket events
  useEffect(() => {
    const handlePeersInRoom = (payload: { peers: { peerId: string; userName: string; userRole: string }[] }) => {
      if (!peer || !localStream) return;
      console.log('Connecting to existing peers:', payload.peers.map(p => p.peerId));
      payload.peers.forEach(({ peerId, userName }) => {
        if (peerId === myPeerId) return;
        // Avoid duplicate connections
        if (connectedPeers[peerId]) {
          console.log('Already connected to:', peerId);
          return;
        }
        console.log('Connecting to existing peer:', peerId);
        setConnectedPeers(prev => ({
          ...prev,
          [peerId]: { id: peerId, name: userName }
        }));
        const call = peer.call(peerId, localStream);
        call.on('stream', (remoteStream) => {
          setConnectedPeers(prev => ({
            ...prev,
            [peerId]: { ...prev[peerId], stream: remoteStream, call }
          }));
          setHasRemoteAudio(true);
          const videoElement = remoteVideosRef.current[peerId];
          if (videoElement) {
            videoElement.srcObject = remoteStream;
            videoElement.playsInline = true;
            videoElement.muted = false; // Enable audio
            videoElement.play().catch(() => {});
          }
        });
        call.on('close', () => {
          setConnectedPeers(prev => {
            const copy = { ...prev };
            delete copy[peerId];
            return copy;
          });
        });
      });
    };

    const handlePeerJoined = (data: { peerId: string; userName: string; userRole: string }) => {
      if (data.peerId !== myPeerId && peer && localStream) {
        // Avoid duplicate connections
        if (connectedPeers[data.peerId]) {
          console.log('Already connected to joined peer:', data.peerId);
          return;
        }
        console.log('New peer joined, calling:', data.peerId);
        setConnectedPeers(prev => ({ ...prev, [data.peerId]: { id: data.peerId, name: data.userName } }));
        const call = peer.call(data.peerId, localStream);
        call.on('stream', (remoteStream) => {
          setConnectedPeers(prev => ({ ...prev, [data.peerId]: { ...prev[data.peerId], stream: remoteStream, call } }));
          setHasRemoteAudio(true);
          const videoElement = remoteVideosRef.current[data.peerId];
          if (videoElement) {
            videoElement.srcObject = remoteStream;
            videoElement.playsInline = true;
            videoElement.muted = false; // Enable audio
            videoElement.play().catch(() => {});
          }
        });
        call.on('close', () => {
          setConnectedPeers(prev => {
            const copy = { ...prev };
            delete copy[data.peerId];
            return copy;
          });
        });
      }
    };

    const handlePeerLeft = (data: { peerId: string }) => {
      setConnectedPeers(prev => {
        const copy = { ...prev };
        if (copy[data.peerId]?.call) copy[data.peerId].call.close();
        delete copy[data.peerId];
        return copy;
      });
    };

    socket.on('peers_in_room', handlePeersInRoom);
    socket.on('peer_joined', handlePeerJoined);
    socket.on('peer_left', handlePeerLeft);

    return () => {
      socket.off('peers_in_room', handlePeersInRoom);
      socket.off('peer_joined', handlePeerJoined);
      socket.off('peer_left', handlePeerLeft);
    };
  }, [peer, localStream, myPeerId, socket, audioAllowed]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  }, [localStream, isVideoEnabled]);

  const toggleAudio = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  }, [localStream, isAudioEnabled]);

  const handleEndCall = () => {
    if (peer) {
      socket.emit('peer_left', { peerId: myPeerId });
    }
    // Clean up global instances
    if (globalPeer && !(globalPeer as any).destroyed) {
      (globalPeer as any).destroy();
      globalPeer = null;
    }
    if (globalStream) {
      globalStream.getTracks().forEach(track => track.stop());
      globalStream = null;
    }
    globalPeerId = null;
    onClose();
  };

  const containerHeight = fullHeight ? '100vh' : `${height}px`;
  const participantCount = Object.keys(connectedPeers).length + 1; // +1 for self

  if (error) {
    return (
      <div className="relative bg-gray-900 rounded-lg overflow-hidden shadow-2xl" style={{ height: containerHeight }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-white p-6">
            <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold mb-2">Video Call Error</h3>
            <p className="text-gray-400 text-sm mb-4">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative glass-dark rounded-xl overflow-hidden border border-cyan-500/30" style={{ height: containerHeight }}>
      {/* Futuristic Header */}
      <div className="glass px-4 py-3 flex justify-between items-center border-b border-cyan-500/30">
        <div className="text-white">
          <h3 className="font-semibold flex items-center text-cyber text-glow" style={{color: 'var(--cyber-blue)'}}>
            📹 Video Conference
          </h3>
          <p className="text-sm text-cyan-300/70">
            {participantCount} participant{participantCount !== 1 ? 's' : ''} • <span className="text-green-400">● Live</span>
          </p>
        </div>
        
        <div className="flex space-x-2">
          {/* Video toggle */}
          <button
            onClick={toggleVideo}
            className={`cyber-btn p-2 rounded-full transition-all duration-300 ${
              isVideoEnabled 
                ? 'neon-green text-white' 
                : 'neon-pink text-white'
            }`}
            title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isVideoEnabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
              )}
            </svg>
          </button>

          {/* Audio toggle */}
          <button
            onClick={toggleAudio}
            className={`cyber-btn p-2 rounded-full transition-all duration-300 ${
              isAudioEnabled 
                ? 'neon-green text-white' 
                : 'neon-pink text-white'
            }`}
            title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isAudioEnabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-3a1 1 0 011-1h1m0 0l2.879-2.879A3 3 0 0112 9.172v1.378a3 3 0 01-1.121 2.338l-.5.5a3 3 0 001.5 1.5L12 14.5z" />
              )}
            </svg>
          </button>

          <div className="glass px-3 py-1 rounded-full flex items-center space-x-2">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
            <span className="text-cyan-400 text-xs font-medium">{userName}</span>
          </div>

          <button
            onClick={handleEndCall}
            className="cyber-btn px-3 py-1 neon-pink text-white rounded-lg text-xs font-medium flex items-center space-x-1 transition-all duration-300"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 8v8a2 2 0 002 2h6m5-6V6a2 2 0 00-2-2H5a2 2 0 00-2 2v11" />
            </svg>
            <span>End</span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-white text-sm">Starting video call...</p>
            <p className="text-gray-400 text-xs mt-2">Allow camera and microphone access</p>
          </div>
        </div>
      )}


      {/* Video Grid */}
      <div className="p-3 h-full overflow-y-auto" style={{ height: 'calc(100% - 70px)' }}>
        <div className={`grid gap-2 ${
          participantCount <= 2 ? 'grid-cols-1' : 'grid-cols-2'
        }`}>
          {/* Local video */}
          <div className="relative bg-gray-800 rounded-md overflow-hidden" style={{ minHeight: '120px' }}>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-1 left-1 bg-black bg-opacity-70 text-white px-1 py-0.5 rounded text-xs">
              You {!isVideoEnabled && '(Off)'}
            </div>
            <div className="absolute top-1 right-1">
              {!isAudioEnabled && (
                <div className="bg-red-600 text-white p-0.5 rounded">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-3a1 1 0 011-1h1m0 0l2.879-2.879A3 3 0 0112 9.172v1.378a3 3 0 01-1.121 2.338l-.5.5a3 3 0 001.5 1.5L12 14.5z" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Remote videos */}
          {Object.values(connectedPeers).map((peer) => (
            <div key={peer.id} className="relative bg-gray-800 rounded-md overflow-hidden" style={{ minHeight: '120px' }}>
              <video
                ref={el => { remoteVideosRef.current[peer.id] = el; }}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1 left-1 bg-black bg-opacity-70 text-white px-1 py-0.5 rounded text-xs">
                {peer.name || `User ${peer.id.slice(-4)}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions - only show for full height */}
      {fullHeight && (
        <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded text-xs">
          <div className="font-semibold">Quick Controls:</div>
          <div>Space: Toggle mute • V: Toggle camera</div>
        </div>
      )}
    </div>
  );
};

export default SimpleVideoCall;
