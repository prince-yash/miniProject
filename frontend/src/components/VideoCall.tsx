import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

interface VideoCallProps {
  socket: Socket;
  localUserId: string;
  remoteUsers: { [userId: string]: { name: string; videoEnabled: boolean; audioEnabled: boolean } };
  onVideoToggle: (enabled: boolean) => void;
  onAudioToggle: (enabled: boolean) => void;
  userRole?: 'admin' | 'student';
}

interface PeerConnection {
  connection: RTCPeerConnection;
  remoteStream?: MediaStream;
}

const VideoCall: React.FC<VideoCallProps> = ({
  socket,
  localUserId,
  remoteUsers,
  onVideoToggle,
  onAudioToggle,
  userRole = 'student'
}) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerConnections, setPeerConnections] = useState<{ [userId: string]: PeerConnection }>({});
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<{ [userId: string]: HTMLVideoElement | null }>({});

  // WebRTC configuration
  const rtcConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Initialize local media stream
  const initializeLocalStream = useCallback(async () => {
    if (isInitializing) return;
    setIsInitializing(true);

    try {
      console.log('Requesting camera and microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: true
      });

      console.log('Got media stream:', stream);
      console.log('Video tracks:', stream.getVideoTracks());
      console.log('Audio tracks:', stream.getAudioTracks());

      setLocalStream(stream);
      
      // Ensure video element gets the stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(e => console.error('Error playing video:', e));
        console.log('Video element updated with stream');
      } else {
        console.error('Local video ref not available');
      }

      setIsVideoEnabled(true);
      setIsAudioEnabled(true);
      onVideoToggle(true);
      onAudioToggle(true);

      // Notify other users that we started video
      socket.emit('start_video_call');

    } catch (error) {
      console.error('Error accessing media devices:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Could not access camera/microphone: ${errorMessage}. Please check permissions.`);
    } finally {
      setIsInitializing(false);
    }
  }, [socket, onVideoToggle, onAudioToggle, isInitializing]);

  // Create peer connection
  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    const peerConnection = new RTCPeerConnection(rtcConfiguration);

    // Add local stream tracks to peer connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('Received remote stream from:', remoteUserId);
      const [remoteStream] = event.streams;
      console.log('Remote stream tracks:', remoteStream.getTracks());
      
      setPeerConnections(prev => ({
        ...prev,
        [remoteUserId]: {
          ...prev[remoteUserId],
          remoteStream
        }
      }));

      // Set remote video element
      const videoElement = remoteVideosRef.current[remoteUserId];
      if (videoElement) {
        videoElement.srcObject = remoteStream;
        videoElement.play().catch(e => console.error('Error playing remote video:', e));
        console.log('Remote video element updated');
      } else {
        console.error('Remote video element not found for user:', remoteUserId);
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          to: remoteUserId,
          candidate: event.candidate
        });
      }
    };

    return peerConnection;
  }, [localStream, socket, rtcConfiguration]);

  // Create offer for outgoing call
  const createOffer = useCallback(async (remoteUserId: string) => {
    // Check for existing connections inside the callback to avoid dependency issues
    setPeerConnections(prev => {
      if (prev[remoteUserId]) {
        console.log('Peer connection already exists for', remoteUserId);
        return prev;
      }

      const peerConnection = createPeerConnection(remoteUserId);
      
      // Create offer in next tick after state update
      setTimeout(async () => {
        try {
          console.log('Creating offer for', remoteUserId);
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);

          socket.emit('offer', {
            to: remoteUserId,
            offer: offer
          });
        } catch (error) {
          console.error('Error creating offer:', error);
        }
      }, 0);

      return {
        ...prev,
        [remoteUserId]: { connection: peerConnection }
      };
    });
  }, [createPeerConnection, socket]);

  // Handle incoming offer
  const handleOffer = useCallback(async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
    const { from: remoteUserId, offer } = data;
    console.log('Received offer from', remoteUserId);
    
    setPeerConnections(prev => {
      // If we already have a connection, close it first to avoid conflicts
      if (prev[remoteUserId]) {
        console.log('Closing existing connection before handling offer');
        prev[remoteUserId].connection.close();
      }

      const peerConnection = createPeerConnection(remoteUserId);
      
      // Handle offer in next tick
      setTimeout(async () => {
        try {
          console.log('Setting remote description and creating answer');
          await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          socket.emit('answer', {
            to: remoteUserId,
            answer: answer
          });
        } catch (error) {
          console.error('Error handling offer:', error);
        }
      }, 0);

      return {
        ...prev,
        [remoteUserId]: { connection: peerConnection }
      };
    });
  }, [createPeerConnection, socket]);

  // Handle incoming answer
  const handleAnswer = useCallback(async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
    const { from: remoteUserId, answer } = data;
    const peerData = peerConnections[remoteUserId];

    if (peerData) {
      try {
        await peerData.connection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  }, [peerConnections]);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (data: { from: string; candidate: RTCIceCandidateInit }) => {
    const { from: remoteUserId, candidate } = data;
    const peerData = peerConnections[remoteUserId];

    if (peerData) {
      try {
        await peerData.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    }
  }, [peerConnections]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        const newEnabled = !isVideoEnabled;
        videoTrack.enabled = newEnabled;
        setIsVideoEnabled(newEnabled);
        onVideoToggle(newEnabled);

        if (newEnabled) {
          socket.emit('start_video_call');
        } else {
          socket.emit('stop_video_call');
        }
      }
    }
  }, [localStream, isVideoEnabled, onVideoToggle, socket]);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        const newEnabled = !isAudioEnabled;
        audioTrack.enabled = newEnabled;
        setIsAudioEnabled(newEnabled);
        onAudioToggle(newEnabled);

        socket.emit('toggle_audio', { enabled: newEnabled });
      }
    }
  }, [localStream, isAudioEnabled, onAudioToggle, socket]);

  // Screen sharing (admin only)
  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        // Replace video track with screen share
        const screenTrack = screenStream.getVideoTracks()[0];
        
        Object.values(peerConnections).forEach(({ connection }) => {
          const sender = connection.getSenders().find(s => 
            s.track && s.track.kind === 'video'
          );
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        // Update local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        setIsScreenSharing(true);

        // Handle screen share ending
        screenTrack.addEventListener('ended', () => {
          setIsScreenSharing(false);
          // Revert back to camera
          if (localStream) {
            const cameraTrack = localStream.getVideoTracks()[0];
            Object.values(peerConnections).forEach(({ connection }) => {
              const sender = connection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
              );
              if (sender && cameraTrack) {
                sender.replaceTrack(cameraTrack);
              }
            });
            
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStream;
            }
          }
        });

      } catch (error) {
        console.error('Error starting screen share:', error);
        alert('Could not start screen sharing. Please check permissions.');
      }
    } else {
      // Stop screen sharing
      if (localStream) {
        const cameraTrack = localStream.getVideoTracks()[0];
        
        Object.values(peerConnections).forEach(({ connection }) => {
          const sender = connection.getSenders().find(s => 
            s.track && s.track.kind === 'video'
          );
          if (sender && cameraTrack) {
            sender.replaceTrack(cameraTrack);
          }
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
      }
      setIsScreenSharing(false);
    }
  }, [isScreenSharing, localStream, peerConnections]);

  // Sync localStream with video element
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      console.log('Syncing local stream with video element');
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.error('Error auto-playing video:', e));
    }
  }, [localStream]);

  // Setup Socket.IO event listeners
  useEffect(() => {
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);

    socket.on('user_video_status', (data: { userId: string; videoEnabled: boolean; username: string }) => {
      if (data.userId !== localUserId && data.videoEnabled && localStream) {
        // Deterministic initiator to avoid offer glare
        const shouldInitiate = localUserId < data.userId;
        if (shouldInitiate) {
          console.log('Will initiate call to', data.userId);
          createOffer(data.userId);
        } else {
          console.log('Waiting for offer from', data.userId);
        }
      }
    });

    // Cleanup when a user leaves to close their peer connection
    socket.on('user_left', (data: { userId: string }) => {
      const remoteUserId = data.userId;
      const peerData = peerConnections[remoteUserId];
      if (peerData) {
        console.log('Closing connection to', remoteUserId);
        peerData.connection.close();
        setPeerConnections(prev => {
          const copy = { ...prev } as typeof prev;
          delete copy[remoteUserId];
          return copy;
        });
      }
      // Remove remote video element ref
      delete remoteVideosRef.current[remoteUserId];
    });

    return () => {
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('user_video_status');
      socket.off('user_left');
    };
  }, [socket, handleOffer, handleAnswer, handleIceCandidate, localUserId, localStream, createOffer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      Object.values(peerConnections).forEach(({ connection }) => {
        connection.close();
      });
    };
  }, [localStream, peerConnections]);

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Video Conference</h3>
        <div className="flex space-x-2">
          <button
            onClick={toggleVideo}
            disabled={!localStream}
            className={`p-2 rounded-full ${
              isVideoEnabled 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-red-600 hover:bg-red-700'
            } text-white transition-colors disabled:opacity-50`}
            title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isVideoEnabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
              )}
            </svg>
          </button>
          
          <button
            onClick={toggleAudio}
            disabled={!localStream}
            className={`p-2 rounded-full ${
              isAudioEnabled 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-red-600 hover:bg-red-700'
            } text-white transition-colors disabled:opacity-50`}
            title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isAudioEnabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 616 0v6a3 3 0 01-3 3z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-3a1 1 0 011-1h1m0 0l2.879-2.879A3 3 0 0112 9.172v1.378a3 3 0 01-1.121 2.338l-.5.5a3 3 0 001.5 1.5L12 14.5z" />
              )}
            </svg>
          </button>

          {/* Screen sharing (admin only) */}
          {userRole === 'admin' && (
            <button
              onClick={toggleScreenShare}
              disabled={!localStream}
              className={`p-2 rounded-full ${
                isScreenSharing 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-gray-600 hover:bg-gray-700'
              } text-white transition-colors disabled:opacity-50`}
              title={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Start call button */}
      {!localStream && (
        <div className="text-center py-8">
          <button
            onClick={initializeLocalStream}
            disabled={isInitializing}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {isInitializing ? 'Starting...' : 'Start Video Call'}
          </button>
        </div>
      )}

      {/* Video grid */}
      {localStream && (
        <div className="grid grid-cols-1 gap-3">
          {/* Local video */}
          <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{ backgroundColor: '#1f2937' }}
              onLoadedMetadata={() => console.log('Local video metadata loaded')}
              onPlay={() => console.log('Local video started playing')}
              onError={(e) => console.error('Local video error:', e)}
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
              You {isScreenSharing && '(Screen)'} {!isVideoEnabled && '(Camera Off)'}
            </div>
            {isScreenSharing && (
              <div className="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded text-xs">
                📺 Sharing Screen
              </div>
            )}
            {/* Debug info */}
            <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
              {localStream ? `📹 ${localStream.getVideoTracks().length}V ${localStream.getAudioTracks().length}A` : '❌ No Stream'}
            </div>
          </div>

          {/* Remote videos */}
          {Object.entries(remoteUsers).map(([userId, user]) => (
            <div key={userId} className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
              <video
                ref={el => { remoteVideosRef.current[userId] = el; }}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                {user.name} {!user.videoEnabled && '(Camera Off)'}
              </div>
              {!user.audioEnabled && (
                <div className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-3a1 1 0 011-1h1m0 0l2.879-2.879A3 3 0 0112 9.172v1.378a3 3 0 01-1.121 2.338l-.5.5a3 3 0 001.5 1.5L12 14.5z" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoCall;
