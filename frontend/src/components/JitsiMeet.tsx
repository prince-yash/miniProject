import React, { useRef, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';

interface JitsiMeetProps {
  socket: Socket;
  roomName: string;
  userName: string;
  userRole: 'admin' | 'student';
  onClose: () => void;
  fullHeight?: boolean; // When true, use full viewport height
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

const JitsiMeet: React.FC<JitsiMeetProps> = ({
  socket,
  roomName,
  userName,
  userRole,
  onClose,
  fullHeight = false
}) => {
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const [jitsiApi, setJitsiApi] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(true); // Start with iframe by default
  const [tryAdvancedAPI, setTryAdvancedAPI] = useState(false);
  const loadingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const loadJitsiScript = () => {
      return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) {
          resolve(window.JitsiMeetExternalAPI);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://meet.jit.si/external_api.js';
        script.async = true;
        script.onload = () => resolve(window.JitsiMeetExternalAPI);
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    const initializeJitsi = async () => {
      try {
        console.log('Loading Jitsi Meet...');
        await loadJitsiScript();

        // Fallback timeout: show hint if loading takes too long
        if (loadingTimeoutRef.current) window.clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = window.setTimeout(() => {
          if (isLoading) {
            console.warn('Jitsi taking too long to load, trying iframe fallback');
            setUseIframeFallback(true);
            setIsLoading(false);
          }
        }, 15000);

        if (!jitsiContainerRef.current) {
          throw new Error('Jitsi container not available');
        }

        const domain = 'meet.jit.si';
        const options = {
          roomName: `EduCanvas-${roomName}`,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainerRef.current,
          configOverwrite: {
            // Zoom-like conference settings
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            enableWelcomePage: false,
            requireDisplayName: false,
            enableUserRolesBasedOnToken: false,
            disableThirdPartyRequests: false,
            disableLocalVideoFlip: false,
            backgroundAlpha: 0.5,
            skipPrejoin: true,
            disableModeratorIndicator: true,
            disableInitialGUM: false,
            
            // Enhanced video/audio quality
            resolution: 720,
            constraints: {
              video: {
                height: { ideal: 720, max: 1080, min: 240 },
                width: { ideal: 1280, max: 1920, min: 320 }
              }
            },
            
            // Better conference experience
            defaultVideoQuality: 'high',
            disableAudioLevels: false,
            enableNoAudioDetection: true,
            enableNoisyMicDetection: true,
            
            // Gallery view settings
            channelLastN: 25, // Show up to 25 participants
            maxFullResolutionParticipants: 2,
            
            // UI improvements
            toolbarConfig: {
              alwaysVisible: false,
              autoHideWhileChatIsOpen: true,
              timeout: 4000
            },
            
            // Disable features that make it less Zoom-like
            disableRtx: false,
            enableTalkWhileMuted: false,
            
            // Recording and streaming (optional)
            recordingService: {
              enabled: false
            },
            liveStreamingEnabled: false,
            
            // Better mobile experience
            disableH264: false,
            preferH264: true
          },
          interfaceConfigOverwrite: {
            // Notification settings
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false, // Show when people join/leave
            DISABLE_PRESENCE_STATUS: true,
            DISABLE_DOMINANT_SPEAKER_INDICATOR: false,
            
            // UI simplification
            HIDE_INVITE_MORE_HEADER: true,
            DISABLE_INVITE: true,
            DISABLE_VIDEO_BACKGROUND: false,
            DISABLE_FOCUS_INDICATOR: false,
            DISABLE_PRIVATE_MESSAGES: false,
            DISABLE_SERVICES_BUTTON: true,
            DISABLE_TRANSCRIPTION_SUBTITLES: true,
            
            // Branding
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            BRAND_WATERMARK_LINK: "",
            SHOW_POWERED_BY: false,
            SHOW_PROMOTIONAL_CLOSE_PAGE: false,
            APP_NAME: 'EduCanvas Live Conference',
            NATIVE_APP_NAME: 'EduCanvas Live',
            PROVIDER_NAME: 'EduCanvas',
            
            // Visual settings
            DEFAULT_BACKGROUND: '#1f2937',
            DISABLE_RINGING: true,
            AUDIO_LEVEL_PRIMARY_COLOR: 'rgba(59, 130, 246, 0.8)',
            AUDIO_LEVEL_SECONDARY_COLOR: 'rgba(59, 130, 246, 0.4)',
            POLICY_LOGO: null,
            
            // Video layout - Zoom-like
            LOCAL_THUMBNAIL_RATIO: 16 / 9,
            REMOTE_THUMBNAIL_RATIO: 16 / 9,
            VIDEO_LAYOUT_FIT: 'both',
            TILE_VIEW_MAX_COLUMNS: 5,
            filmStripOnly: false,
            VERTICAL_FILMSTRIP: true,
            INITIAL_TOOLBAR_TIMEOUT: 5000,
            
            // Connection indicators
            CONNECTION_INDICATOR_AUTO_HIDE_ENABLED: true,
            CONNECTION_INDICATOR_AUTO_HIDE_TIMEOUT: 5000,
            CONNECTION_INDICATOR_DISABLED: false,
            
            // Language
            LANG_DETECTION: true,
            
            // Mobile app links
            MOBILE_DOWNLOAD_LINK_ANDROID: 'https://play.google.com/store/apps/details?id=org.jitsi.meet',
            MOBILE_DOWNLOAD_LINK_IOS: 'https://itunes.apple.com/us/app/jitsi-meet/id1165103905',
            MOBILE_DOWNLOAD_LINK_F_DROID: 'https://f-droid.org/en/packages/org.jitsi.meet/',
            
            // Zoom-like toolbar with essential controls
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'desktop', 'chat', 'raisehand',
              'participants-pane', 'tileview', 'fullscreen', 'settings',
              'videobackgroundblur', 'hangup'
            ]
          },
          userInfo: {
            displayName: userName,
            email: `${userName.toLowerCase().replace(/\s/g, '')}@educanvas.local`
          }
        };

        console.log('Initializing Jitsi with options:', options);
        const api = new window.JitsiMeetExternalAPI(domain, options);
        
        // Event listeners
        api.addEventListener('videoConferenceJoined', (event: any) => {
          console.log('Joined Jitsi conference:', event);
          setIsLoading(false);
          if (loadingTimeoutRef.current) window.clearTimeout(loadingTimeoutRef.current);
          
          // No special admin setup - everyone joins equally
          
          // Notify other users via socket
          socket.emit('user_joined_video', {
            userName,
            userRole,
            jitsiParticipantId: event.id
          });
        });

        api.addEventListener('videoConferenceLeft', (event: any) => {
          console.log('Left Jitsi conference:', event);
          socket.emit('user_left_video', {
            userName,
            userRole
          });
          onClose();
        });

        api.addEventListener('participantJoined', (event: any) => {
          console.log('Participant joined:', event);
        });

        api.addEventListener('participantLeft', (event: any) => {
          console.log('Participant left:', event);
        });

        api.addEventListener('displayNameChanged', (event: any) => {
          console.log('Display name changed:', event);
        });

        api.addEventListener('audioMuteStatusChanged', (event: any) => {
          console.log('Audio mute status changed:', event);
          socket.emit('audio_status_changed', {
            userName,
            muted: event.muted
          });
        });

        api.addEventListener('videoMuteStatusChanged', (event: any) => {
          console.log('Video mute status changed:', event);
          socket.emit('video_status_changed', {
            userName,
            muted: event.muted
          });
        });

        api.addEventListener('readyToClose', () => {
          console.log('Jitsi ready to close');
          onClose();
        });

        api.addEventListener('screenSharingStatusChanged', (event: any) => {
          console.log('Screen sharing status changed:', event);
          socket.emit('screen_share_status_changed', {
            userName,
            sharing: event.on,
            userRole
          });
        });

        setJitsiApi(api);

      } catch (error) {
        console.error('Error initializing Jitsi:', error);
        setError(`Failed to load video conference: ${error}`);
        setIsLoading(false);
      }
    };

    // Only try the advanced API if explicitly requested
    if (tryAdvancedAPI && !useIframeFallback) {
      initializeJitsi();
    }

    // Cleanup
    return () => {
      if (loadingTimeoutRef.current) window.clearTimeout(loadingTimeoutRef.current);
      if (jitsiApi) {
        try { jitsiApi.dispose(); } catch {}
      }
    };
  }, [roomName, userName, userRole, socket, onClose, jitsiApi, isLoading, useIframeFallback, tryAdvancedAPI]);

  const handleEndCall = () => {
    if (jitsiApi) {
      jitsiApi.executeCommand('hangup');
    } else {
      onClose();
    }
  };

  if (error) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 text-center">
        <div className="text-red-400 mb-4">
          <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">Video Conference Error</p>
        </div>
        <p className="text-gray-400 text-xs mb-4">{error}</p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
        >
          Close
        </button>
      </div>
    );
  }

  const containerHeight = fullHeight ? '100vh' : '700px';

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden shadow-2xl" style={{ height: containerHeight }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-4 py-3 flex justify-between items-center border-b border-gray-700">
        <div className="text-white">
          <h3 className="font-semibold flex items-center">
            📹 Video Conference {useIframeFallback ? '(Simple Mode)' : '(API Mode)'}
          </h3>
          <p className="text-sm text-gray-400">Room: EduCanvas-{roomName} • Zoom-like Experience</p>
        </div>
        <div className="flex space-x-2">
          {useIframeFallback && (
            <button
              onClick={() => {
                setUseIframeFallback(false);
                setTryAdvancedAPI(true);
                setIsLoading(true);
              }}
              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
              title="Try advanced API with more features"
            >
              Try API Mode
            </button>
          )}
          {!useIframeFallback && (
            <button
              onClick={() => {
                setUseIframeFallback(true);
                setTryAdvancedAPI(false);
                setIsLoading(false);
              }}
              className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
              title="Use simple iframe (more reliable)"
            >
              Use Simple Mode
            </button>
          )}
          <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
            👥 {userName}
          </span>
          <button
            onClick={handleEndCall}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center space-x-2 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 8v8a2 2 0 002 2h6m5-6V6a2 2 0 00-2-2H5a2 2 0 00-2 2v11" />
            </svg>
            <span>Leave Conference</span>
          </button>
        </div>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-10">
          <div className="text-center max-w-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-white text-sm">Loading video conference...</p>
            <p className="text-gray-400 text-xs mt-2">If it takes too long:</p>
            <ul className="text-gray-400 text-xs mt-2 space-y-1 list-disc list-inside text-left">
              <li>Ensure Internet access to meet.jit.si</li>
              <li>Disable ad/tracker blockers for this site</li>
              <li>Accept camera/microphone permissions</li>
              <li>Try opening the room directly:</li>
            </ul>
            <a
              href={`https://meet.jit.si/EduCanvas-${roomName}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 text-blue-400 hover:underline text-xs"
            >
              Open https://meet.jit.si/EduCanvas-{roomName}
            </a>
          </div>
        </div>
      )}

      {/* Jitsi container - iframe by default, API mode optional */}
      {useIframeFallback ? (
        <div className="w-full" style={{ height: 'calc(100% - 60px)' }}>
          <iframe
            src={`https://meet.jit.si/EduCanvas-${roomName}#config.startWithAudioMuted=false&config.startWithVideoMuted=false&config.prejoinPageEnabled=false&config.requireDisplayName=false&config.enableWelcomePage=false&config.defaultVideoQuality=high&config.resolution=720&config.channelLastN=25&interfaceConfig.TILE_VIEW_MAX_COLUMNS=5&interfaceConfig.VIDEO_LAYOUT_FIT=both&userInfo.displayName="${encodeURIComponent(userName)}"`}
            allow="camera; microphone; fullscreen; speaker; display-capture; compute-pressure; accelerometer; gyroscope"
            allowFullScreen
            className="w-full h-full border-0"
            title="Jitsi Meet Video Conference"
            onLoad={() => console.log('Jitsi iframe loaded successfully')}
            onError={() => console.error('Jitsi iframe failed to load')}
          />
        </div>
      ) : (
        <div 
          ref={jitsiContainerRef} 
          className="w-full h-full"
          style={{ height: 'calc(100% - 60px)' }}
        />
      )}

      {/* Zoom-like usage instructions */}
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-3 py-2 rounded text-xs max-w-xs">
        <div className="font-semibold mb-1">📹 Conference Controls:</div>
        <ul className="space-y-1 text-xs">
          <li>• Click 🎤 to mute/unmute</li>
          <li>• Click 📷 for camera on/off</li>
          <li>• Click 🖥️ to share screen</li>
          <li>• Click ⏹️ for grid/speaker view</li>
          <li>• Click 💬 for chat</li>
        </ul>
      </div>
    </div>
  );
};

export default JitsiMeet;
