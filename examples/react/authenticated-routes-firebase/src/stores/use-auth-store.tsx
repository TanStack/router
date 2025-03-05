import type { User } from "firebase/auth";
import { create } from "zustand";

// Define the auth store state
export type AuthState = {
	isAuthenticated: boolean;
	user: User | null;
	setUser: (user: User | null) => void;
};

// Create the auth store
export const useAuthStore = create<AuthState>((set) => ({
	isAuthenticated: false,
	user: null,
	setUser: (user: User | null) => {
        console.log(
            "Auth state changed:",
            user ? `User logged in: ${user.email || user.uid}` : "User logged out",
            user
        );
		return set({
			user,
			isAuthenticated: !!user,
		});
	},
}));
