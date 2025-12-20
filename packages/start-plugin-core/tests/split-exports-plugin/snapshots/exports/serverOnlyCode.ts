// Test file: Complex module with server-only code (real-world scenario)
// server-only

// This is isomorphic - used on both client and server
export const formatUser = (user: {
  name: string;
}) => {
  return user.name.toUpperCase();
};

// This is server-only - should be eliminated when only formatUser is imported

// This is also server-only