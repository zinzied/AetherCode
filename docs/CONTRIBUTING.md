# Contributing to OpenModelHub

Thank you for your interest in contributing to OpenModelHub! We welcome contributions from the community to help make this platform better.

## How to Contribute

### 1. Fork the Repository
- Fork the repository on GitHub
- Clone your fork locally: `git clone https://github.com/yourusername/openmodelhub.git`

### 2. Set Up Development Environment
- Follow the installation instructions in the [README](../README.md)
- Install dependencies for frontend, backend, and workers
- Set up the database

### 3. Create a Branch
- Create a new branch for your feature: `git checkout -b feature/your-feature-name`
- Or for bug fixes: `git checkout -b fix/issue-number`

### 4. Make Changes
- Write clear, concise commit messages
- Follow the existing code style and conventions
- Add tests for new features
- Update documentation as needed

### 5. Test Your Changes
- Run the test suite: `npm test` in relevant directories
- Test manually in the browser/development server
- Ensure no linting errors

### 6. Submit a Pull Request
- Push your branch to your fork
- Create a pull request with a clear description
- Reference any related issues
- Wait for review and address feedback

## Code Style Guidelines

- Use TypeScript for all new code
- Follow ESLint and Prettier configurations
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Reporting Issues

- Use GitHub Issues to report bugs or request features
- Provide detailed steps to reproduce bugs
- Include browser/OS information when relevant
- Suggest solutions if possible

## Development Workflow

1. **Frontend**: React + TypeScript with Vite
2. **Backend**: Node.js + Express/NestJS with TypeScript
3. **Database**: PostgreSQL with migrations
4. **Workers**: Node.js cron jobs for background tasks

## Questions?

If you have questions about contributing, feel free to open an issue or contact the maintainers.

Thank you for helping make OpenModelHub better! 🚀