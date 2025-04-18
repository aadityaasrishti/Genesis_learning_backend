# School Management System Backend

This is the backend application for the School Management System, built with Node.js and Express.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=5000
JWT_SECRET=your-secret-key-here

# Database Configuration
DATABASE_URL="mysql://username:password@localhost:3306/database_name"

# API Configuration
REACT_APP_API_BASE_URL=https://your-api-url

# School Information
SCHOOL_NAME="Your School Name"
SCHOOL_ADDRESS="Your School Address"
```

## Development Setup

1. Install dependencies
```bash
npm install
```

2. Run database migrations
```bash
npx prisma migrate dev
```

3. Start development server
```bash
npm run dev
```

## API Documentation

For detailed API documentation, please refer to the API documentation in the `/docs` directory.#   G e n e s i s _ l e a r n i n g _ b a c k e n d  
 