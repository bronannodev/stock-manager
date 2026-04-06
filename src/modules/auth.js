import { supabase } from '../config/supabase.js';

export async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
}

export async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}