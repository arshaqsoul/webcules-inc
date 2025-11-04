import { User } from "@webcules/payload/payload-types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@webcules/ui/components/card";
import { Badge } from "@webcules/ui/components/badge";
import { Button } from "@webcules/ui/components/button";
import { User as UserIcon, CreditCard, X, Check } from "lucide-react";

interface ProfileTabProps {
  user: User;
  onCancelSubscription: () => Promise<void>;
  isCancelling: boolean;
}

export function ProfileTab({
  user,
  onCancelSubscription,
  isCancelling,
}: ProfileTabProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white/10 text-white border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>
            Your account details and subscription status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Name</label>
              <p className="text-lg">{user.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Email</label>
              <p className="text-lg">{user.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Role</label>
              <p>
                <Badge
                  variant={user.role === "admin" ? "default" : "secondary"}
                >
                  {user.role}
                </Badge>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">
                Member Since
              </label>
              <p className="text-lg">{formatDate(user.createdAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/10 text-white border-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription Status
          </CardTitle>
          <CardDescription>
            Manage your subscription and billing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Subscription Plan</p>
              <p className="text-sm text-gray-500">
                {user.isPaid && user.subscriptionStatus === "active"
                  ? "Active Subscription"
                  : "No Active Subscription"}
              </p>
            </div>
            <Badge
              variant={
                user.isPaid && user.subscriptionStatus === "active"
                  ? "default"
                  : "secondary"
              }
              className="flex items-center gap-1"
            >
              {user.isPaid && user.subscriptionStatus === "active" ? (
                <>
                  <Check className="h-3 w-3" />
                  Active
                </>
              ) : (
                "Inactive"
              )}
            </Badge>
          </div>

          {user.isPaid && user.subscriptionStatus === "active" && (
            <div className="pt-4 border-t">
              <Button
                variant="destructive"
                onClick={onCancelSubscription}
                disabled={isCancelling}
                className="flex items-center gap-2"
              >
                {isCancelling ? (
                  "Cancelling..."
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    Cancel Subscription
                  </>
                )}
              </Button>
              <p className="text-sm text-gray-500 mt-2">
                Canceling will stop future billing but you'll keep access until
                the end of your billing period.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
