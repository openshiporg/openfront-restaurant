![openfront-restaurant](https://github.com/user-attachments/assets/72d52854-0594-4bb8-b3b3-13ab2d3e01a0)


[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fopenshiporg%2Fopenfront-restaurant&env=SESSION_SECRET&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22group%22%3A%22postgres%22%7D%5D)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/openfront-restaurant)

Openfront Restaurant is a specialized version of the Openfront platform designed specifically for the food and beverage industry. It provides a complete suite of tools for restaurant management, including Point of Sale (POS), Kitchen Display Systems (KDS), table management, menu engineering, and waitlist handling.

## Demo

https://github.com/user-attachments/assets/e3a061fb-3c03-4b89-81f0-4aa973c26556

| | |
|---|---|
| **Storefront** | [restaurant.openship.org](https://restaurant.openship.org) |
| **Dashboard** | [restaurant.openship.org/dashboard](https://restaurant.openship.org/dashboard) |
| **User** | `craft@openship.org` |
| **Password** | `xZZ8nqW&!KT1^S6b45c^gwmv51Y50y!y@a*` |

[Learn more →](https://openship.org/products/openfront-restaurant)

[Documentation →](https://docs.openship.org/docs/openfront/restaurant/)

## Core Features

### Point of Sale (POS)
A modern, touch-optimized POS interface for staff to take orders, manage tables, and process payments. Supports complex modifications, split checks, and real-time synchronization with the kitchen.

### Kitchen Display System (KDS)
Streamline your back-of-house operations with a digital KDS. Orders from the POS appear instantly, allowing chefs to manage preparation times, mark items as ready, and coordinate with the front-of-house.

### Table & Seating Management
Visualize your floor plan and manage guest seating in real-time. Track table status (Available, Occupied, Dirty, Reserved) and optimize your restaurant's capacity.

### Menu Engineering
Manage complex menus with categories, products, variants, and modifiers. Set up happy hours, seasonal specials, and digital menus that update across all devices instantly.

### Waitlist & Reservations
Integrated waitlist management with SMS notifications. Allow guests to join the waitlist remotely or at the door, and manage reservations to ensure smooth service.

### AI Assistant
Streamline your restaurant operations with our MCP-powered AI Assistant.
- **Menu Management**: Add new menu items or update prices via natural language.
- **Operational Efficiency**: Mark items out-of-stock or update table status through chat.
- **Permission Safe**: The AI respects your user role's permissions, calling the same API as the POS and Dashboard.

## Architecture

### Technology Stack
- **Frontend**: Next.js 15 with App Router
- **Backend**: KeystoneJS 6 with GraphQL API
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS 4 with shadcn/ui components
- **Real-time**: GraphQL Subscriptions & SWR for live updates

### Application Structure
```
openfront-restaurant/
├── app/                    # Next.js App Router
│   ├── dashboard/         # Admin platform interface
│   ├── pos/              # Point of Sale interface
│   ├── kds/              # Kitchen Display System
│   └── api/              # API endpoints and webhooks
├── features/
│   ├── keystone/         # Backend models and GraphQL schema
│   ├── platform/         # Admin platform components
│   ├── pos/             # POS-specific components
│   └── kds/             # KDS-specific components
└── components/           # Shared UI components
```

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL database
- npm, yarn, pnpm, or bun

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/openshiporg/openfront-restaurant.git
   cd openfront-restaurant
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

   Update `.env` with your configuration:
   ```env
   # Required - Database Connection
   DATABASE_URL="postgresql://username:password@localhost:5432/openfront_restaurant"

   # Required - Session Security
   SESSION_SECRET="your-very-long-session-secret-key-here-32-chars-minimum"

   # Optional - S3 Storage for Food Images
   S3_BUCKET_NAME="your-bucket-name"
   S3_REGION="us-east-1"
   S3_ACCESS_KEY_ID="your-access-key"
   S3_SECRET_ACCESS_KEY="your-secret-key"
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   - **Dashboard**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
   - **POS**: [http://localhost:3000/pos](http://localhost:3000/pos)
   - **KDS**: [http://localhost:3000/kds](http://localhost:3000/kds)

## Security & Permissions

### Role-Based Access Control
- `canManageMenu` - Edit products and prices
- `canAccessPOS` - Access the ordering interface
- `canAccessKDS` - Access kitchen prep view
- `canManageWaitlist` - Manage guest flow
- `canViewReports` - Financial and operational analytics

## Documentation

For comprehensive technical documentation, see [docs.openship.org/docs/openfront/restaurant](https://docs.openship.org/docs/openfront/restaurant/)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built on top of [next-keystone-starter](https://github.com/junaid33/next-keystone-starter)
