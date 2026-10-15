# App Changes Log

## Version 6.6.0 (2026-05-16)
- **Removal of Google Drive Integration and Sync**:
  - Removed Google Drive backup and cloud restore workflows.
  - Removed Google OAuth authentication and token management.
  - Removed periodic background sync and delta synchronization service.
  - Simplified database backup to secure local SQLite database export and restore.
  - Cleaned up backend endpoints and proxy routes in `server.ts`.

## Version 6.5.0 (2026-05-01)
- **Advanced Printer Implementation**:
  - Replaced legacy printing logic with `capacitor-thermal-printer` plugin for native Android Bluetooth support.
  - Implemented `PrinterService` for robust device scanning, connection monitoring, and error handling.
  - Added platform guards and fallback logic to resolve "Plugin not implemented" errors on web platforms.
  - Added "text pruning" and line formatting to ensure perfect receipt alignment on 58mm paper.
  - Integrated native ESC/POS commands for bold headers, center alignment, and barcode generation.
  - Updated Android manifest with granular permissions for Bluetooth Scan and Connect (Android 12+ compatibility).
- **Theming & UI Updates**:
  - Refined layout background, side menu, and footer navigation buttons with soft themed colors (#bad8f5).
  - Switched from pure white to off-white for main content backgrounds in light mode.
- **Data Synchronization & Backups**:
  - Implemented migration to Supabase for multi-device sync and cloud backend infrastructure.
  - Upgraded internal local data syncing to handle delta updates smoothly between instances.
  - Implemented Google Drive synchronization rules to easily backup and restore the internal SQLite database.
- **Account & Registration Updates**:
  - Added visibility toggles for passwords in login and signup forms.
  - Made registration validations stricter for emails, phone numbers, and pharmacy name uniqueness.
  - Added automatic provisioning of settings (`storeName`, `phoneNumber`, `storeEmail`) upon successful signup.
- Updated application version to 6.5.0.

## Version 6.4.0 (2026-04-30)
- **Printer Connectivity & Settings**:
  - Added default Bluetooth printer selection with persistent connectivity.
  - Users can now select from already paired Bluetooth devices.
  - Implemented automatic reconnection to the default printer for receipts and reports.
  - Added support for wired/USB printers via system default printer configuration.
- **DebtBook Enhancements**:
  - Added automatic warnings if a payment amount exceeds the customer's total debt.
  - Implemented intelligent payment distribution: payments now reduce unpaid sale/invoice balances sequentially (FIFO).
  - Fixed account balance synchronization when viewing customer transaction details.
- **System Fixes & UI**:
  - Updated theme colors: Layout background, side menu, and mobile navigation bar shifted to a light sky blue (#bad8f5) for improved visual consistency.
  - Improved Cloud Run deployment stability.
  - Updated application version to 6.4.0.

## Version 6.2.1 (2026-04-15)
- **Inventory & Batch Enhancements**:
  - Added batch number and expiry date tracking to the "Receive New Goods" process.
  - Implemented automatic creation of new inventory entries for different batches of the same product.
  - Added FIFO (First-In, First-Out) recommendation logic to prioritize soonest expiring items.
  - Implemented expired product blocking with flashing warnings and auto-deactivation.
- **UI/UX Improvements**:
  - Repositioned the date and time modal on the Dashboard to be above the greetings.
  - Renamed "Purchases" to "New Goods" in the sidebar and main headers.
  - Fixed z-index issues in the "New Goods" section for nested modals.
  - Optimized numeric inputs in "Receive Goods" to prevent forceful resets to '1'.
- Updated application version to 6.2.1.

## Version 5.7.0 (2026-04-11)
- **UI/UX Refinements**:
  - **Vertical Zoom Slider**: Added a vertical zoom slider on the Dashboard with persistence and +/- controls.
  - **Navigation Improvements**: Moved Settings button into the main sidebar navigation list for consistent access.
  - **Stacking Order**: Adjusted z-index for sidebar (z-70) and dashboard elements (z-20) to fix overlap issues.
  - **Layout Optimization**: Fixed bottom content obstruction by moving spacers and adjusting wrapper padding.
  - **Mobile Responsiveness**: Improved sidebar and navigation visibility on mobile devices.
- Updated application version to 5.7.0.

## Version 5.6.0 (2026-04-06)
- **Market List Improvements**:
  - Centralized the "New Order" button for better accessibility.
  - Fixed dark mode compliance for the "New Order" form (header, inputs, and item list).
  - Adjusted the "New Order" modal to open near the top of the page.
- **Settings Enhancements**:
  - Improved language options alignment for mobile view (single column on mobile, left-aligned text).
  - Fixed dark mode compliance for "Printing Options" and "Print Behavior" sections.
  - Added dark mode support for selected states and warning messages in printing settings.
- **Inventory Updates**:
  - Adjusted the "Add Product/Service" form to open near the top of the page for better usability.
- Updated application version to 5.6.0.

## Version 5.5.0 (2026-04-06)
- Improved "Market List" navigation and mobile responsiveness.
- Renamed "Account Order" to "Customer Order" in Market List.
- Enhanced "Calendar" with new filtering options:
  - View upcoming holidays, staff leave, and duty schedules.
  - Added weekly and monthly view toggles for upcoming events.
  - Adjusted "Add Event" form positioning to open at the top of the page for better accessibility.
- Improved "Dashboard" to ensure calendar events are prominently displayed.
- Updated application version to 5.5.0.

## Version 5.4.0 (2026-04-06)
- Fixed mobile navigation in "Add New Branch" modal by adding scrollable content.
- Fixed horizontal scrolling in "Manage Users" table for mobile devices.
- Improved barcode scanning in "Inventory" and "New Sale":
  - Added support for scanning product aliases.
  - Added automatic trimming of scanned barcodes to prevent match failures.
  - In "Inventory", scanning an exact match now automatically opens the edit modal.
  - In "New Sale", scanning an exact match automatically adds the item to the cart.
- Updated application version to 5.4.0.

## Version 5.3.0 (2026-04-06)
- Implemented Branch management system.
- Added "Branches" tab to Users & Roles management.
- Enabled branch assignment for users.
- Fixed JSON parsing errors by adding missing API routes to the local interceptor.
- Improved Role Management UI with scrollable permissions and sticky save button.
- Updated application version to 5.3.0.

## Version 5.2.0 (2026-04-03)
- Added Tutorials section to side menu with multi-language support.
- Removed User Accounts section from Security settings.
- Removed "Security" navigation item from settings sidebar.
- Added app version information to the footer of Sign In and Sign Up pages.
- Updated version information to 5.2.0.

## Version 5.1.0 (2026-04-02)
- Added Invoicing System: Comprehensive invoice creation and management.
- Create invoices for customers with items from inventory or manual entry.
- Auto-populated store information (editable).
- Invoice history with search and status filters (Paid, Unpaid, Overdue, Cancelled).
- Preview, Print, and Share functionality for invoices.
- Unique invoice number generation (INV-XXXXXX).
- Support for notes and custom payment details on invoices.
- Integrated "Invoices" button in the side menu.

## Version 5.0.5 (2026-04-02)
- Added per-customer debt limit in Debt Book.
- Renamed "Menu" footer button to "More".
- Renamed "Add Account" to "Add Customer" in Debt Book.
- Added Contact Picker integration to easily import customer name and phone from device contacts.
- Fixed missing account update/delete handlers in local API.

## Version 5.0.4 (2026-04-02)
- Added Store Logo support in settings and sidebar.
- Added Store Account Details (Bank, Account Name, Number) for invoices and receipts.
- Added Printer Settings for multiple receipt copies.
- Added toggles for printing logo and account information on receipts.

## Version 5.0.3 (2026-04-02)
- Implemented "Reset App Settings" functionality.
- Users can now restore application settings to defaults without losing business data (products, sales, accounts, etc.).
- Added confirmation dialog for settings reset.

## Version 5.0.2 (2026-04-02)
- Enhanced database restoration with automatic schema migration.
- Added detailed notifications for database restore success, including schema updates.
- Improved database stability when restoring across different application versions.

## Version 5.0.1 (2026-04-02)
- Initial versioning implementation.
- Added version display to Dashboard and Settings.
- Created `app_changes.md` to track version history.
- Fixed mobile side menu scrolling and viewport height issues.
- Moved Payroll button directly under Expenses in side menu.
- Renamed "Record" to "Market Orders" in side menu and permissions.
- Implemented Payroll management system with employee tracking and expense integration.
- Added amber glow effects to Login and Signup buttons.
- Updated RawBT printing intent for better compatibility.
- Case-insensitive username login support.
- Security updates for dependencies (dompurify, path-to-regexp, etc.).
