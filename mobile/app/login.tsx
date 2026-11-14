import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/auth';
import { colors, radius, shadow } from '@/theme';

export default function LoginScreen() {
  const { signIn, signingIn, ready, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [error, setError] = useState('');

  if (ready && user) return <Redirect href="/(tabs)" />;

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }

    setError('');
    try {
      await signIn(username, password);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось войти');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.brandBlock}>
          <View style={styles.mark}>
            <Text style={styles.markText}>IF</Text>
          </View>
          <Text style={styles.brand}>IDEAL FLOOR</Text>
          <Text style={styles.product}>CRM MOBILE</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.eyebrow}>РАБОЧЕЕ ПРИЛОЖЕНИЕ</Text>
          <Text style={styles.title}>Вход в CRM</Text>
          <Text style={styles.subtitle}>
            Используйте тот же логин и пароль, что и в веб-версии.
          </Text>

          <Text style={styles.label}>Логин</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Введите логин"
            placeholderTextColor="#A2A5AB"
            style={styles.input}
          />

          <Text style={styles.label}>Пароль</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="Введите пароль"
              placeholderTextColor="#A2A5AB"
              style={styles.passwordInput}
              onSubmitEditing={submit}
            />
            <Pressable onPress={()=>setShowPassword(value=>!value)} accessibilityRole="button"
              accessibilityLabel={showPassword?'Скрыть пароль':'Показать пароль'}
              style={styles.passwordEye}>
              <Text style={styles.eyeText}>{showPassword?'◉':'◎'}</Text>
            </Pressable>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={signingIn}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              signingIn && styles.buttonDisabled,
            ]}
          >
            {signingIn ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Войти</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.footer}>IDEAL FLOOR · Kazakhstan</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
  brandBlock: { alignItems: 'center', marginBottom: 28 },
  mark: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  markText: { color: '#fff', fontWeight: '900', fontSize: 24, letterSpacing: -1 },
  brand: { marginTop: 14, fontSize: 21, fontWeight: '900', color: colors.ink, letterSpacing: 1.5 },
  product: { marginTop: 2, fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  eyebrow: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { marginTop: 5, color: colors.ink, fontSize: 26, fontWeight: '900' },
  subtitle: { marginTop: 7, marginBottom: 20, color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { marginBottom: 6, color: colors.text, fontSize: 12, fontWeight: '800' },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#D9DCE1',
    paddingHorizontal: 15,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: '#FBFBFC',
    marginBottom: 14,
  },
  passwordWrap:{flexDirection:'row',alignItems:'center',height:52,marginBottom:14,
    borderRadius:radius.md,borderColor:'#D9DCE1',borderWidth:1,backgroundColor:'#FBFBFC'},
  passwordInput:{flex:1,minWidth:0,paddingHorizontal:15,fontSize:16,color:colors.ink},
  passwordEye:{width:48,height:48,alignItems:'center',justifyContent:'center'},
  eyeText:{fontSize:22,color:colors.muted},
  error: { color: colors.danger, fontSize: 12, fontWeight: '700', marginBottom: 12 },
  button: {
    marginTop: 4,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { transform: [{ scale: 0.99 }], opacity: 0.92 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  footer: { marginTop: 22, textAlign: 'center', color: '#9A9DA3', fontSize: 11, fontWeight: '700' },
});
