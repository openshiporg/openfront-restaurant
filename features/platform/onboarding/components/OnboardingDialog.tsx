'use client';

import React from 'react';
import {
  AlertCircle,
  AppWindowIcon as Apps,
  ArrowUpRight,
  Loader2,
  Utensils,
  UtensilsCrossed,
  CircleCheck,
  Eye,
  InfoIcon,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomSetupSteps } from './CustomSetupSteps';
import { SectionRenderer } from './SectionRenderer';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingApi } from '../hooks/useOnboardingApi';
import { getItemsFromJsonData } from '../utils/dataUtils';
import { RESTAURANT_TEMPLATES, SECTION_DEFINITIONS } from '../config/templates';

// Payment provider environment variable mapping adapted for restaurant
const PAYMENT_METHOD_ENV_VARS: Record<string, string[]> = {
  'Credit Card': ['NEXT_PUBLIC_STRIPE_KEY', 'STRIPE_SECRET_KEY'],
  'Mobile Payment': ['NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
};

// Component to display payment method environment variables
interface PaymentMethodEnvDisplayProps {
  createdMethods: string[];
}

const PaymentMethodEnvDisplay: React.FC<PaymentMethodEnvDisplayProps> = ({
  createdMethods,
}) => {
  const providersWithEnvVars = createdMethods.filter(
    (method) => PAYMENT_METHOD_ENV_VARS[method]
  );

  if (providersWithEnvVars.length === 0) {
    return null;
  }

  const renderEnvVars = (method: string) => {
    const envVars = PAYMENT_METHOD_ENV_VARS[method];
    if (!envVars) return null;

    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground mb-3">
          For {method} to work, you need to add these environment variables to your .env file:
        </p>
        {envVars.map((envVar: string) => (
          <div key={envVar} className="flex items-center gap-2">
            <code className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded text-xs font-mono">
              {envVar}
            </code>
          </div>
        ))}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Eye className="ml-2 h-3 w-3 cursor-help text-red-500" />
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="p-3 text-xs max-w-sm z-[100]"
        >
          {renderEnvVars(providersWithEnvVars[0])}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface OnboardingDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const OnboardingDialog: React.FC<OnboardingDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const onboardingState = useOnboardingState();
  const {
    step,
    selectedTemplate,
    currentJsonData,
    customJsonApplied,
    progressMessage,
    loadingItems,
    completedItems,
    error,
    itemErrors,
    isLoading,
    setStep,
    setSelectedTemplate,
    setCurrentJsonData,
    setCustomJsonApplied,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    setError,
    setIsLoading,
    resetOnboardingState,
  } = onboardingState;

  const { runOnboarding } = useOnboardingApi({
    selectedTemplate,
    currentJsonData,
    completedItems,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    setStep,
    setError,
    setIsLoading,
    resetOnboardingState,
  });

  if (!isOpen) return null;

  const templateConfig = RESTAURANT_TEMPLATES[selectedTemplate];
  const displayNames = currentJsonData 
    ? {
        storeInfo: getItemsFromJsonData(currentJsonData, 'storeInfo'),
        categories: getItemsFromJsonData(currentJsonData, 'categories'),
        menuItems: getItemsFromJsonData(currentJsonData, 'menuItems'),
        modifiers: getItemsFromJsonData(currentJsonData, 'modifiers'),
        tables: getItemsFromJsonData(currentJsonData, 'tables'),
        paymentMethods: getItemsFromJsonData(currentJsonData, 'paymentMethods'),
        kitchenStations: getItemsFromJsonData(currentJsonData, 'kitchenStations'),
        floors: getItemsFromJsonData(currentJsonData, 'floors'),
        sections: getItemsFromJsonData(currentJsonData, 'sections'),
      }
    : templateConfig.displayNames;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[95vw] flex-col overflow-hidden p-0 gap-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-4 sm:px-6 py-4 mb-0 shrink-0">
          <DialogTitle>Restaurant Setup</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Mobile-first layout: Store Setup header and Setup Type appear first */}
          <div className="order-1 flex shrink-0 flex-col lg:order-none lg:w-80 lg:justify-between lg:border-r">
            <div className="flex-1">
              <div className="p-4 sm:p-6">
                {/* Store Setup Header - Always visible first on mobile */}
                <div className="flex items-center space-x-3">
                  <div className="inline-flex shrink-0 items-center justify-center rounded-sm bg-muted p-3">
                    <Utensils
                      className="size-5 text-foreground"
                      aria-hidden={true}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-medium text-foreground">
                      Menu Setup
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {step === 'done'
                        ? 'Your restaurant is ready'
                        : 'Configure your restaurant menu'}
                    </p>
                  </div>
                </div>
                <Separator className="my-4" />

                {step === 'done' ? (
                  <>
                    <h4 className="text-sm font-medium text-foreground mb-2">
                      Setup Complete
                    </h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Your {selectedTemplate === 'minimal' ? 'basic' : 'complete'} restaurant setup is ready to use.
                    </p>
                    <div className="flex items-center space-x-2 text-sm text-emerald-600 dark:text-emerald-500 mb-4">
                      <CircleCheck className="h-4 w-4 fill-emerald-500 text-background" />
                      <span>Setup complete</span>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.categories.length} category{displayNames.categories.length === 1 ? '' : 'ies'} created
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.menuItems.length} menu item{displayNames.menuItems.length === 1 ? '' : 's'} created
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.modifiers.length} modifier{displayNames.modifiers.length === 1 ? '' : 's'} created
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.tables.length} table{displayNames.tables.length === 1 ? '' : 's'} created
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-muted-foreground">
                        <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                        <span className="font-medium">
                          {displayNames.paymentMethods.length} payment method{displayNames.paymentMethods.length === 1 ? '' : 's'} created
                        </span>
                        <PaymentMethodEnvDisplay
                          createdMethods={
                            displayNames.paymentMethods
                          }
                        />
                      </div>
                    </div>
                  </>
                ) : !isLoading ? (
                  <>
                    <h4 className="text-sm font-medium text-foreground mb-4">
                      Setup Type
                    </h4>
                    
                    {/* Mobile: Dropdown selector */}
                    <div className="block lg:hidden">
                      <Select
                        value={selectedTemplate}
                        onValueChange={(value) => setSelectedTemplate(value as 'minimal' | 'full' | 'custom')}
                      >
                        <SelectTrigger className="w-full h-auto py-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minimal">
                            <div className="flex flex-col items-start text-left">
                              <span className="font-medium">Basic Setup</span>
                              <span className="text-xs text-muted-foreground">A few sample items to get started</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="full">
                            <div className="flex flex-col items-start text-left">
                              <span className="font-medium">Complete Setup</span>
                              <span className="text-xs text-muted-foreground">All categories, menu items, and modifiers</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="custom">
                            <div className="flex flex-col items-start text-left">
                              <span className="font-medium">Custom Setup</span>
                              <span className="text-xs text-muted-foreground">Use your own JSON templates</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Desktop: Radio Group */}
                    <div className="hidden lg:block">
                      <RadioGroup
                        value={selectedTemplate}
                        onValueChange={(value) =>
                          setSelectedTemplate(value as 'minimal' | 'full' | 'custom')
                        }
                        className="space-y-4"
                      >
                        <div
                          className={`border p-4 rounded-md transition-colors cursor-pointer ${
                            selectedTemplate === 'minimal'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'hover:border-blue-200'
                          }`}
                          onClick={() => setSelectedTemplate('minimal')}
                        >
                          <div className="flex gap-4">
                            <div className="flex-shrink-0 mt-[3px]">
                              <UtensilsCrossed
                                className={`h-5 w-5 ${
                                  selectedTemplate === 'minimal'
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                            <div className="flex-1">
                              <RadioGroupItem
                                value="minimal"
                                id="minimal"
                                className="sr-only"
                              />
                              <Label
                                htmlFor="minimal"
                                className="flex-1 cursor-pointer"
                              >
                                <div className="font-medium text-base mb-1">
                                  Basic Setup
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  A few sample items to get started
                                </div>
                              </Label>
                            </div>
                          </div>
                        </div>
                        <div
                          className={`border p-4 rounded-md transition-colors cursor-pointer ${
                            selectedTemplate === 'full'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'hover:border-blue-200'
                          }`}
                          onClick={() => setSelectedTemplate('full')}
                        >
                          <div className="flex gap-4">
                            <div className="flex-shrink-0 mt-[3px]">
                              <Utensils
                                className={`h-5 w-5 ${
                                  selectedTemplate === 'full'
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                            <div className="flex-1">
                              <RadioGroupItem
                                value="full"
                                id="full"
                                className="sr-only"
                              />
                              <Label
                                htmlFor="full"
                                className="flex-1 cursor-pointer"
                              >
                                <div className="font-medium text-base mb-1">
                                  Complete Setup
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  All categories, menu items, and modifiers
                                </div>
                              </Label>
                            </div>
                          </div>
                        </div>
                        <div
                          className={`border p-4 rounded-md transition-colors cursor-pointer ${
                            selectedTemplate === 'custom'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'hover:border-blue-200'
                          }`}
                          onClick={() => setSelectedTemplate('custom')}
                        >
                          <div className="flex gap-4">
                            <div className="flex-shrink-0 mt-[3px]">
                              <CircleCheck
                                className={`h-5 w-5 ${
                                  selectedTemplate === 'custom'
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                            <div className="flex-1">
                              <RadioGroupItem
                                value="custom"
                                id="custom"
                                className="sr-only"
                              />
                              <Label
                                htmlFor="custom"
                                className="flex-1 cursor-pointer"
                              >
                                <div className="font-medium text-base mb-1">
                                  Custom Setup
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Use your own JSON templates
                                </div>
                              </Label>
                            </div>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="text-sm font-medium text-foreground">
                      Creating {selectedTemplate === 'minimal' ? 'Basic' : 'Complete'} Setup
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {progressMessage}
                    </p>
                  </>
                )}
              </div>
            </div>
            {/* Desktop buttons - hidden on mobile */}
            <div className="hidden lg:flex flex-col border-t mt-auto">
              {/* Error message above buttons */}
              {error && !isLoading && step !== 'done' && (
                <Badge
                  color="rose"
                  className="rounded-none gap-3 text-sm border-b"
                >
                  <AlertCircle className="size-4 sm:size-7" />
                  <span className="text-xs sm:text-sm">
                    Error: Please ensure you're using a fresh installation
                    without existing data.
                  </span>
                </Badge>
              )}

              {/* Desktop Buttons */}
              <div className="flex items-center justify-between p-4">
                {step === 'done' ? (
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="w-full sm:w-auto">
                        Close
                      </Button>
                    </DialogClose>
                    <Button asChild className="w-full sm:w-auto">
                      <a href="/" target="_blank" rel="noopener noreferrer">
                        View your storefront
                        <ArrowUpRight className="ml-1.5 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <DialogClose asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isLoading}
                        className="w-full sm:w-auto"
                      >
                        Cancel
                      </Button>
                    </DialogClose>
                    {isLoading ? (
                      <Button disabled className="w-full sm:w-auto">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </Button>
                    ) : (
                      <Button onClick={runOnboarding} className="w-full sm:w-auto">
                        Confirm
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="order-2 min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:order-none">
            {selectedTemplate === 'custom' && step === 'template' && !customJsonApplied ? (
              /* Custom Setup Steps */
              <CustomSetupSteps
                currentJson={currentJsonData}
                onJsonUpdate={(newJsonData) => {
                  setCurrentJsonData(newJsonData);
                  setCustomJsonApplied(true);
                }}
                onBack={() => setCustomJsonApplied(false)}
              />
            ) : (
              /* Unified Section Renderer Component */
              <SectionRenderer
                sections={SECTION_DEFINITIONS}
                selectedTemplate={selectedTemplate}
                isLoading={isLoading}
                loadingItems={loadingItems}
                completedItems={completedItems}
                itemErrors={itemErrors}
                error={error}
                step={step}
                currentJsonData={currentJsonData}
              />
            )}
          </div>
        </div>

        {/* Mobile buttons - attached to bottom */}
        <div className="flex shrink-0 flex-col border-t lg:hidden">
          {/* Mobile Error message above buttons */}
          {error && !isLoading && step !== 'done' && (
            <Badge
              color="rose"
              className="rounded-none gap-3 text-sm border-b"
            >
              <AlertCircle className="size-4 sm:size-7" />
              <span className="text-xs sm:text-sm">
                Error: Please ensure you're using a fresh installation
                without existing data.
              </span>
            </Badge>
          )}

          {/* Mobile Buttons */}
          <div className="flex items-center justify-between p-4">
            {step === 'done' ? (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="flex-1">
                    Close
                  </Button>
                </DialogClose>
                <Button asChild className="flex-1">
                  <a href="/" target="_blank" rel="noopener noreferrer">
                    View your storefront
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </a>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isLoading}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </DialogClose>
                {isLoading ? (
                  <Button disabled className="flex-1">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </Button>
                ) : (
                  <Button onClick={runOnboarding} className="flex-1">
                    Confirm
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingDialog;
