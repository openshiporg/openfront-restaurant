import { useRef } from "react";
import { requestSeedRecord, runSeedPhases, seedTableFloor, validateRestaurantSeed } from "../utils/seedRecords";
import { GraphQLClient, gql } from 'graphql-request';
import { startOnboarding, completeOnboarding } from '../actions/onboarding';
import { TemplateType, OnboardingStep } from './useOnboardingState';
import { getUniqueDeliveryPostalCodes, normalizeCountryCode } from '@/features/lib/delivery-zones';
import { DEFAULT_STORE_LOGO_COLOR, DEFAULT_STORE_LOGO_ICON, normalizeStoreLogoColor } from '@/features/lib/store-logo';
import { majorToMinorUnits } from '@/features/lib/currency-units';
import { findSavedSettingsMismatches } from '../utils/setupReadiness';

const GRAPHQL_ENDPOINT = '/api/graphql';

interface OnboardingApiProps {
  selectedTemplate: TemplateType;
  currentJsonData: any;
  completedItems: Record<string, string[]>;
  setProgress: (message: string) => void;
  setItemLoading: (type: string, item: string) => void;
  setItemCompleted: (type: string, item: string) => void;
  setItemError: (type: string, item: string, errorMessage: string) => void;
  setStep: (step: OnboardingStep) => void;
  setError: (error: string | null) => void;
  setSettingsReview: (review: { reused: boolean; checkedFields: string[]; mismatchedFields: string[] }) => void;
  setIsLoading: (loading: boolean) => void;
  resetOnboardingState: () => void;
}

export function useOnboardingApi({
  selectedTemplate,
  currentJsonData,
  completedItems,
  setProgress,
  setItemLoading,
  setItemCompleted,
  setItemError,
  setStep,
  setError,
  setSettingsReview,
  setIsLoading,
  resetOnboardingState,
}: OnboardingApiProps) {

  const running = useRef(false);
  const runOnboarding = async () => {
    if (running.current) return;
    running.current = true;
    setIsLoading(true);
    setError(null);
    resetOnboardingState();
    setStep('progress');
    setProgress('Starting restaurant setup...');

    try {
      validateRestaurantSeed(currentJsonData);
      const client = new GraphQLClient(GRAPHQL_ENDPOINT, { headers: { 'Content-Type': 'application/json' } });
      let categories: Record<string, string> = {};
      let menuItems: Record<string, string> = {};
      let floors: Record<string, string> = {};
      let sections: Record<string, string> = {};
      await runSeedPhases(startOnboarding, [
        () => createStoreSettings(client, currentJsonData),
        async () => { categories = await createCategories(client, currentJsonData); },
        async () => { menuItems = await createMenuItems(client, currentJsonData, categories, currentJsonData.storeInfo?.currencyCode || 'USD'); },
        () => createModifiers(client, currentJsonData, menuItems, currentJsonData.storeInfo?.currencyCode || 'USD'),
        () => createPaymentMethods(client, currentJsonData),
        () => createKitchenStations(client, currentJsonData),
        async () => { floors = await createFloors(client, currentJsonData); },
        async () => { sections = await createSections(client, currentJsonData); },
        () => createTables(client, currentJsonData, floors, sections),
      ], completeOnboarding);
      setProgress('Restaurant setup saved.');
      setStep('done');
    } catch (e: any) {
      handleOnboardingError(e);
    } finally {
      running.current = false;
      setIsLoading(false);
    }
  };

  const createStoreSettings = async (client: GraphQLClient, data: any) => {
    setProgress('Creating store settings...');
    const storeInfo = data.storeInfo;
    if (!storeInfo) return;

    const storeName = storeInfo.name || 'Openfront Restaurant';
    setItemLoading('storeInfo', storeName);

    try {
      const mutation = gql`
        mutation CreateStoreSettings($data: StoreSettingsCreateInput!) {
          createStoreSettings(data: $data) {
            id
            name
          }
        }
      `;

      const settingsInput = Object.fromEntries(Object.entries({
          name: storeInfo.name,
          tagline: storeInfo.tagline,
          logoIcon: storeInfo.logoIcon || DEFAULT_STORE_LOGO_ICON,
          logoColor: normalizeStoreLogoColor(storeInfo.logoColor || DEFAULT_STORE_LOGO_COLOR),
          address: storeInfo.address,
          phone: storeInfo.phone,
          currencyCode: storeInfo.currencyCode || 'USD',
          locale: storeInfo.locale || 'en-US',
          timezone: storeInfo.timezone || 'America/New_York',
          countryCode: normalizeCountryCode(storeInfo.countryCode || 'US'),
          deliveryEnabled: storeInfo.deliveryEnabled ?? true,
          deliveryPostalCodes: getUniqueDeliveryPostalCodes(storeInfo.deliveryPostalCodes),
          hours: storeInfo.hours,
          deliveryFee: storeInfo.deliveryFee?.toString(),
          deliveryMinimum: storeInfo.deliveryMinimum?.toString(),
          pickupDiscount: storeInfo.pickupDiscount,
          taxRate: storeInfo.taxRate?.toString() || "8.75",
          estimatedDelivery: storeInfo.estimatedDelivery,
          estimatedPickup: storeInfo.estimatedPickup,
          heroHeadline: storeInfo.heroHeadline,
          heroSubheadline: storeInfo.heroSubheadline,
          heroTagline: storeInfo.heroTagline,
          promoBanner: storeInfo.promoBanner,
          rating: storeInfo.rating?.toString(),
          reviewCount: storeInfo.reviewCount,
        }).filter(([, value]) => value !== undefined));
      const result: any = await requestSeedRecord(client, mutation, { data: settingsInput });
      const persisted = result.createStoreSettings;
      setSettingsReview({
        reused: Boolean(persisted.reused),
        checkedFields: Object.keys(settingsInput),
        mismatchedFields: findSavedSettingsMismatches(settingsInput, persisted.settingsReview),
      });

      setItemCompleted('storeInfo', storeName);
    } catch (itemError: any) {
      let errorMessage = itemError.message || 'Unknown error';
      if (itemError.response?.errors) {
        errorMessage = itemError.response.errors.map((err: any) => err.message).join('\n');
      }
      setItemError('storeInfo', storeName, errorMessage);
      console.error('Error creating store settings:', itemError);
      throw itemError;
    }
  };

  const createCategories = async (client: GraphQLClient, data: any) => {
    setProgress('Creating menu categories...');
    const createdCategories: Record<string, string> = {};

    for (const category of data.categories || []) {
      const categoryName = category.name || 'Unknown Category';
      setItemLoading('categories', categoryName);

      try {
        const mutation = gql`
          mutation CreateMenuCategory($data: MenuCategoryCreateInput!) {
            createMenuCategory(data: $data) {
              id
              name
            }
          }
        `;

        const result = (await requestSeedRecord(client, mutation, {
          data: {
            name: category.name,
            icon: category.icon,
            sortOrder: category.sortOrder,
            mealPeriods: ['all_day'],
          },
        })) as { createMenuCategory: { id: string; name: string } };

        createdCategories[category.name] = result.createMenuCategory.id;
        setItemCompleted('categories', categoryName);
      } catch (itemError: any) {
        let errorMessage = itemError.message || 'Unknown error';
        if (itemError.response?.errors) {
          errorMessage = itemError.response.errors.map((err: any) => err.message).join('\n');
        }
        setItemError('categories', categoryName, errorMessage);
        console.error(`Error creating category ${category.name}:`, itemError);
        throw itemError;
      }
    }

    return createdCategories;
  };

  const createMenuItems = async (
    client: GraphQLClient,
    data: any,
    createdCategories: Record<string, string>,
    currencyCode: string
  ) => {
    setProgress('Creating menu items...');
    const slugify = (text: string) => text.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');

    const createdMenuItems: Record<string, string> = {};

    for (const item of data.menuItems || []) {
      const itemName = item.name || 'Unknown Item';
      setItemLoading('menuItems', itemName);

      const itemHandle = slugify(item.name);

      try {
        const categoryId = createdCategories[item.category];
        if (!categoryId) throw new Error(`Missing category for ${item.name}`);
        const priceInCents = majorToMinorUnits(item.price, currencyCode);

        const mutation = gql`
          mutation CreateMenuItem($data: MenuItemCreateInput!) {
            createMenuItem(data: $data) {
              id
              name
            }
          }
        `;

        const result = (await requestSeedRecord(client, mutation, {
          data: {
            name: item.name,
            price: priceInCents,
            calories: item.calories,
            available: item.available ?? true,
            featured: item.featured ?? false,
            popular: item.popular ?? false,
            kitchenStation: item.kitchenStation || 'grill',
            prepTime: item.prepTime || 15,
            mealPeriods: ['all_day'],
            category: categoryId ? { connect: { id: categoryId } } : undefined,
            menuItemImages: {
              create: [{
                imagePath: item.image || `/images/${itemHandle}.jpeg`,
                altText: item.name,
              }],
            },
          },
        })) as { createMenuItem: { id: string; name: string } };

        createdMenuItems[item.name] = result.createMenuItem.id;
        setItemCompleted('menuItems', itemName);
      } catch (itemError: any) {
        let errorMessage = itemError.message || 'Unknown error';
        if (itemError.response?.errors) {
          errorMessage = itemError.response.errors.map((err: any) => err.message).join('\n');
        }
        setItemError('menuItems', itemName, errorMessage);
        console.error(`Error creating menu item ${item.name}:`, itemError);
        throw itemError;
      }
    }

    return createdMenuItems;
  };

  const createModifiers = async (
    client: GraphQLClient,
    data: any,
    createdMenuItems: Record<string, string>,
    currencyCode: string
  ) => {
    setProgress('Creating item modifiers...');

    for (const modifier of data.modifiers || []) {
      const modifierName = modifier.name || 'Unknown Modifier';
      setItemLoading('modifiers', modifierName);

      try {
        const menuItemId = createdMenuItems[modifier.menuItemName];
        if (!menuItemId) throw new Error(`Missing menu item for ${modifier.name}`);
        const priceAdjustmentInCents = majorToMinorUnits(modifier.priceAdjustment || '0.00', currencyCode);

        const mutation = gql`
          mutation CreateMenuItemModifier($data: MenuItemModifierCreateInput!) {
            createMenuItemModifier(data: $data) {
              id
              name
            }
          }
        `;

        await requestSeedRecord(client, mutation, {
          data: {
            name: modifier.name,
            modifierGroup: modifier.modifierGroup || 'addons',
            modifierGroupLabel: modifier.modifierGroupLabel,
            priceAdjustment: priceAdjustmentInCents,
            defaultSelected: modifier.defaultSelected ?? false,
            required: modifier.required ?? false,
            minSelections: modifier.minSelections ?? 0,
            maxSelections: modifier.maxSelections ?? 10,
            menuItem: menuItemId ? { connect: { id: menuItemId } } : undefined,
          },
        });

        setItemCompleted('modifiers', modifierName);
      } catch (itemError: any) {
        let errorMessage = itemError.message || 'Unknown error';
        if (itemError.response?.errors) {
          errorMessage = itemError.response.errors.map((err: any) => err.message).join('\n');
        }
        setItemError('modifiers', modifierName, errorMessage);
        console.error(`Error creating modifier ${modifier.name}:`, itemError);
        throw itemError;
      }
    }
  };

  const createPaymentMethods = async (client: GraphQLClient, data: any) => {
    setProgress('Creating payment methods...');

    const selectedMethods = new Set(
      (data.paymentMethods || []).map((method: any) => method.name)
    );
    const providers = [
      {
        seedName: 'Credit Card',
        name: 'Stripe',
        code: 'pp_stripe_stripe',
        isInstalled: true,
        createPaymentFunction: 'stripe',
        capturePaymentFunction: 'stripe',
        refundPaymentFunction: 'stripe',
        getPaymentStatusFunction: 'stripe',
        generatePaymentLinkFunction: 'stripe',
        handleWebhookFunction: 'stripe',
      },
      {
        seedName: 'Mobile Payment',
        name: 'PayPal',
        code: 'pp_paypal_paypal',
        isInstalled: true,
        createPaymentFunction: 'paypal',
        capturePaymentFunction: 'paypal',
        refundPaymentFunction: 'paypal',
        getPaymentStatusFunction: 'paypal',
        generatePaymentLinkFunction: 'paypal',
        handleWebhookFunction: 'paypal',
      },
      {
        seedName: 'Cash',
        name: 'Manual / Cash',
        code: 'pp_system_default',
        isInstalled: true,
        createPaymentFunction: 'manual',
        capturePaymentFunction: 'manual',
        refundPaymentFunction: 'manual',
        getPaymentStatusFunction: 'manual',
        generatePaymentLinkFunction: 'manual',
        handleWebhookFunction: 'manual',
      }
    ].filter((provider) => selectedMethods.size === 0 || selectedMethods.has(provider.seedName));

    for (const { seedName, ...provider } of providers) {
      setItemLoading('paymentMethods', seedName);

      try {
        const mutation = gql`
          mutation CreatePaymentProvider($data: PaymentProviderCreateInput!) {
            createPaymentProvider(data: $data) {
              id
              name
            }
          }
        `;

        await requestSeedRecord(client, mutation, {
          data: provider
        });

        setItemCompleted('paymentMethods', seedName);
      } catch (itemError: any) {
        let errorMessage = itemError.message || 'Unknown error';
        if (itemError.response?.errors) {
          errorMessage = itemError.response.errors.map((err: any) => err.message).join('\n');
        }
        
        setItemError('paymentMethods', seedName, errorMessage);
        throw itemError;
      }
    }
  };

  const createKitchenStations = async (client: GraphQLClient, data: any) => {
    setProgress('Creating kitchen stations...');
    const createdStations: Record<string, string> = {};

    for (const station of data.kitchenStations || []) {
      const stationName = station.name || 'Unknown Station';
      setItemLoading('kitchenStations', stationName);

      try {
        const mutation = gql`
          mutation CreateKitchenStation($data: KitchenStationCreateInput!) {
            createKitchenStation(data: $data) {
              id
              name
            }
          }
        `;

        const result = await requestSeedRecord(client, mutation, {
          data: {
            name: station.name,
            displayOrder: 0,
            isActive: true,
          },
        }) as { createKitchenStation: { id: string } };

        createdStations[station.name] = result.createKitchenStation.id;
        setItemCompleted('kitchenStations', stationName);
      } catch (itemError: any) {
        let errorMessage = itemError.message || 'Unknown error';
        if (itemError.response?.errors) {
          errorMessage = itemError.response.errors.map((err: any) => err.message).join('\n');
        }
        setItemError('kitchenStations', stationName, errorMessage);
        console.error(`Error creating kitchen station ${station.name}:`, itemError);
        throw itemError;
      }
    }

    return createdStations;
  };

  const createFloors = async (client: GraphQLClient, data: any) => {
    setProgress('Creating floors...');
    const createdFloors: Record<string, string> = {};

    for (const floor of data.floors || []) {
      const floorName = floor.name || 'Unknown Floor';
      setItemLoading('floors', floorName);

      try {
        const mutation = gql`
          mutation CreateFloor($data: FloorCreateInput!) {
            createFloor(data: $data) {
              id
              name
            }
          }
        `;

        const result = await requestSeedRecord(client, mutation, {
          data: {
            name: floor.name,
            level: floor.level || 1,
            isActive: floor.isActive ?? true,
          },
        }) as { createFloor: { id: string } };

        createdFloors[floor.name] = result.createFloor.id;
        setItemCompleted('floors', floorName);
      } catch (itemError: any) {
        let errorMessage = itemError.message || 'Unknown error';
        if (itemError.response?.errors) {
          errorMessage = itemError.response.errors.map((err: any) => err.message).join('\n');
        }
        setItemError('floors', floorName, errorMessage);
        console.error(`Error creating floor ${floor.name}:`, itemError);
        throw itemError;
      }
    }

    return createdFloors;
  };

  const createSections = async (client: GraphQLClient, data: any) => {
    setProgress('Creating sections...');
    const createdSections: Record<string, string> = {};

    for (const section of data.sections || []) {
      const sectionName = section.name || 'Unknown Section';
      setItemLoading('sections', sectionName);

      try {
        const mutation = gql`
          mutation CreateSection($data: SectionCreateInput!) {
            createSection(data: $data) {
              id
              name
            }
          }
        `;

        const result = await requestSeedRecord(client, mutation, {
          data: {
            name: section.name,
          },
        }) as { createSection: { id: string } };

        createdSections[section.name] = result.createSection.id;
        setItemCompleted('sections', sectionName);
      } catch (itemError: any) {
        let errorMessage = itemError.message || 'Unknown error';
        if (itemError.response?.errors) {
          errorMessage = itemError.response.errors.map((err: any) => err.message).join('\n');
        }
        setItemError('sections', sectionName, errorMessage);
        console.error(`Error creating section ${section.name}:`, itemError);
        throw itemError;
      }
    }

    return createdSections;
  };

  const createTables = async (
    client: GraphQLClient,
    data: any,
    createdFloors: Record<string, string>,
    createdSections: Record<string, string>
  ) => {
    setProgress('Creating tables...');

    for (const table of data.tables || []) {
      const tableName = `Table ${table.tableNumber}`;
      setItemLoading('tables', tableName);

      try {
        const floorId = createdFloors[seedTableFloor(data, table)];
        const sectionId = createdSections[table.section];
        if (!floorId || !sectionId) throw new Error(`Missing floor or section for ${tableName}`);

        const mutation = gql`
          mutation CreateTable($data: TableCreateInput!) {
            createTable(data: $data) {
              id
              tableNumber
            }
          }
        `;

        await requestSeedRecord(client, mutation, {
          data: {
            tableNumber: table.tableNumber,
            capacity: table.capacity || 4,
            shape: 'rectangle',
            positionX: table.positionX || 0,
            positionY: table.positionY || 0,
            floor: floorId ? { connect: { id: floorId } } : undefined,
            section: sectionId ? { connect: { id: sectionId } } : undefined,
          },
        });

        setItemCompleted('tables', tableName);
      } catch (itemError: any) {
        let errorMessage = itemError.message || 'Unknown error';
        if (itemError.response?.errors) {
          errorMessage = itemError.response.errors.map((err: any) => err.message).join('\n');
        }
        setItemError('tables', tableName, errorMessage);
        console.error(`Error creating table ${table.tableNumber}:`, itemError);
        throw itemError;
      }
    }
  };

  const handleOnboardingError = (e: any) => {
    let errorMessage = e.message || 'Unknown error';

    if (e.response?.errors) {
      errorMessage = e.response.errors
        .map((err: any) => {
          if (err.message?.includes('Unique constraint failed')) {
            return 'This item already exists in the database.';
          }
          return err.message || JSON.stringify(err);
        })
        .join('\n\n');
    }

    setError(errorMessage);
    console.error('Error during onboarding:', e);


  };

  return { runOnboarding };
}
