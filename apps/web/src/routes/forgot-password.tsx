import { createFileRoute } from '@tanstack/react-router';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';

export const Route = createFileRoute('/forgot-password')({
  component: () => (
    <AuthLayout>
      <ForgotPasswordPage />
    </AuthLayout>
  ),
});
