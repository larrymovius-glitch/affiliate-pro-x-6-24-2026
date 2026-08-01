
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

// Safe defaults so downstream components never crash on a missing settings row.
const DEFAULT_PUBLIC_SETTINGS = {
  id: 'apx',
  public_settings: {
    app_name: 'Affiliate Pro X',
    auth_required: false,
  },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(DEFAULT_PUBLIC_SETTINGS);

  /**
   * Builds the app-level `user` object: the Supabase auth user merged with
   * the matching row from public.profiles.
   */
  const hydrateUser = useCallback(async (authUser) => {
    if (!authUser) return null;

    let profile = {};
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      if (error) throw error;
      profile = data || {};
    } catch (err) {
      // The signup trigger creates the profile row; a miss here is non-fatal.
      console.warn('Profile row not available yet:', err.message);
    }

    return {
      id: authUser.id,
      email: authUser.email,
      full_name:
        profile.full_name ||
        authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name ||
        '',
      avatar_url: profile.avatar_url || authUser.user_metadata?.avatar_url || null,
      ...profile,
    };
  }, []);

  /**
   * Applies a referral code captured before signup. Runs once, never blocks auth.
   */
  const applyPendingReferral = useCallback(async (currentUser) => {
    const pendingCode = sessionStorage.getItem('pending_referral_code');
    if (!pendingCode || !currentUser || currentUser.referred_by_code) return currentUser;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ referred_by_code: pendingCode })
        .eq('id', currentUser.id);
      if (error) throw error;
      return { ...currentUser, referred_by_code: pendingCode };
    } catch (refErr) {
      console.warn('Referral code could not be applied (non-blocking):', refErr.message);
      return currentUser;
    } finally {
      sessionStorage.removeItem('pending_referral_code');
    }
  }, []);

  const checkUserAuth = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);

      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (!session?.user) {
        setUser(null);
        setIsAuthenticated(false);
        return;
      }

      let hydrated = await hydrateUser(session.user);
      hydrated = await applyPendingReferral(hydrated);

      setUser(hydrated);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: error.message || 'Authentication required' });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [hydrateUser, applyPendingReferral]);

  const checkAppState = useCallback(async () => {
    try {
      setIsLoadingPublicSettings(true);

      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setAppPublicSettings({
          id: data.id,
          public_settings: data.public_settings || data,
        });
      }
    } catch (error) {
      // Settings are cosmetic — never block the app on them.
      console.warn('Public settings unavailable, using defaults:', error.message);
    } finally {
      setIsLoadingPublicSettings(false);
    }

    await checkUserAuth();
  }, [checkUserAuth]);

  useEffect(() => {
    checkAppState();

    // Keeps state in sync across tabs, token refreshes, and the OAuth redirect.
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthChecked(true);
        setIsLoadingAuth(false);
        return;
      }

      let hydrated = await hydrateUser(session.user);
      hydrated = await applyPendingReferral(hydrated);
      setUser(hydrated);
      setIsAuthenticated(true);
      setAuthChecked(true);
      setIsLoadingAuth(false);
    });

    return () => listener?.subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async (shouldRedirect = true) => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Sign out error (clearing local state anyway):', err.message);
    }
    setUser(null);
    setIsAuthenticated(false);

    if (shouldRedirect) {
      window.location.href = '/login';
    }
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
