import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { ScanFace, Loader2 } from "lucide-react";
import logoImage from "figma:asset/80b7a2d7f7164e79d1aa41e678d57bd410cbb0ae.png";

interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onBiometricLogin: () => Promise<void>;
  showBiometricLogin: boolean;
}

export function LoginForm({
  onLogin,
  onBiometricLogin,
  showBiometricLogin,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticating, setIsAuthenticating] =
    useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email && password) {
      setIsLoading(true);
      // Show loading screen for 1.5 seconds
      setTimeout(async () => {
        await onLogin(email, password)
          .finally(() => {
            setIsLoading(false);
          });
      }, 1500);
    }
  };

  const handleBiometricLogin = () => {
    setIsAuthenticating(true);
    setIsLoading(true);
    // Simulate biometric scan delay before requesting temporary biometric sign-in.
    setTimeout(() => {
      setIsAuthenticating(false);
      onBiometricLogin()
        .finally(() => {
          setIsLoading(false);
        });
    }, 1500);
  };

  // Loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-md mx-auto bg-background shadow-2xl min-h-screen relative flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 text-vibrant-blue animate-spin" />
            <p className="text-lg text-muted-foreground">Signing you in...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto bg-background shadow-2xl min-h-screen relative flex flex-col">
        {/* Main login content */}
        <div className="flex-1 flex items-center justify-center px-6 pb-20">
          <div className="w-full space-y-8">
            {/* Logo and welcome text */}
            <div className="text-center space-y-4">
              <div className="mx-auto w-70 h-70 flex items-center justify-center">
                <img 
                  src={logoImage} 
                  alt="WFH Pulse Logo" 
                  className="w-70 h-70 object-contain"
                />
              </div>
            </div>

            {/* Login form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@mit003.uic"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 bg-vibrant-blue hover:opacity-90 text-vibrant-blue-foreground mt-8"
              >
                Sign In
              </Button>
            </form>

            {/* Divider */}
            {showBiometricLogin ? (
              <div className="relative">
                <Separator />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3">
                  <span className="text-sm text-muted-foreground">
                    or
                  </span>
                </div>
              </div>
            ) : null}

            {/* Biometric login */}
            {showBiometricLogin ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleBiometricLogin}
                disabled={isAuthenticating}
                className="w-full h-12 border-2"
              >
                {isAuthenticating ? (
                  <>
                    <ScanFace className="h-5 w-5 mr-2 animate-pulse" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <ScanFace className="h-5 w-5 mr-2" />
                    Sign in with Face ID
                  </>
                )}
              </Button>
            ) : null}

            {/* Demo notice */}
            <p className="text-center text-sm text-muted-foreground">
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}