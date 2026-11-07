import { Stack } from 'expo-router';
import { AuthProvider } from '@/context/auth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="dealer/[id]" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </AuthProvider>
  );
}
