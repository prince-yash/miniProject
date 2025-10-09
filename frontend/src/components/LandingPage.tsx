import React, { useState } from 'react';

interface LandingPageProps {
  onJoinClassroom: (name: string, adminCode?: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onJoinClassroom }) => {
  const [name, setName] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (name.trim()) {
      setIsLoading(true);
      onJoinClassroom(name.trim(), isAdmin ? adminCode : undefined);
    }
  };

  return (
    <div className="min-h-screen space-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(15)].map((_, i) => (
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

      <div className="glass-dark rounded-xl p-8 w-full max-w-md border border-cyan-500/30 relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 neon-blue rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-cyber text-glow mb-2" style={{color: 'var(--cyber-blue)'}}>EduCanvas Live</h1>
          <p className="text-cyan-300/80">Join the collaborative classroom</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-cyan-300 mb-2">
              Your Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 glass rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-transparent border border-cyan-500/30"
              placeholder="Enter your name"
              required
              disabled={isLoading}
            />
          </div>

          <div className="border-t border-cyan-500/30 pt-6">
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="admin-toggle"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="h-4 w-4 text-cyan-400 focus:ring-cyan-500 border-cyan-500/30 rounded bg-transparent"
                disabled={isLoading}
              />
              <label htmlFor="admin-toggle" className="ml-2 text-sm text-cyan-300">
                I want to be the teacher/admin 👑
              </label>
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <label htmlFor="adminCode" className="block text-sm font-medium text-purple-300">
                  Admin Code
                </label>
                <input
                  type="password"
                  id="adminCode"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  className="w-full px-4 py-2 glass rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-transparent border border-purple-500/30"
                  placeholder="Enter admin code (hint: teach123)"
                  disabled={isLoading}
                />
                <p className="text-xs text-purple-300/70">
                  Only the first person with the correct code becomes admin
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!name.trim() || isLoading}
            className="w-full cyber-btn neon-green text-white py-3 px-4 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition duration-300 flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Joining Classroom...
              </>
            ) : (
              '🚀 Join Classroom'
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-cyan-500/30 text-center">
          <p className="text-xs text-cyan-300/60">
            ⚡ Temporary session - Everything resets when the app restarts
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
