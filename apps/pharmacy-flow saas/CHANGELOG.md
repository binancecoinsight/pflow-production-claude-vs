# Changelog

All notable changes to this project will be documented in this file.

## [6.5.0] - 2026-05-15
### Added
- **Security Visibility**: Added a "show password" toggle (eye icon) on both login and signup forms for improved accessibility.
- **Account Validation**: Implemented strict validation checks during signup to prevent duplicate emails, phone numbers, and pharmacy names.
- **Auto-Provisioning Settings**: Automatically populates `storeName`, `phoneNumber`, `storeAddress`, and `storeEmail` in the application settings upon a successful signup.
- **Cloud Infrastructure**: Added a full migration path to Supabase for multi-device data synchronization.
- **Advanced Synchronization**: Upgraded the Sync Service to perform delta syncs efficiently, resolving previous duplicate tracking bugs.
- **Google Drive Backup Sync Rules**: Included Google Drive sync rules to handle database backup and restoration efficiently across device resets.

### Changed
- **Login Clarity**: Updated the login input placeholder to explicitly allow "Username or Email".
- **Store Name Protection**: The pharmacy name is now disabled and cannot be changed from the settings page after the initial setup is complete.

## [6.3.1] - 2026-04-23
### Changed
- **UI Stability**: Completely disabled horizontal dragging on dashboard cards and application-wide to prevent unintended shifts.
- **Dynamic Branding**: Updated default receipt message to use `{storeName}` placeholder, ensuring it automatically syncs with the active pharmacy name.
- **Dashboard Metrics**: Verified real-time revenue and sales percentage trends are accurately reflected based on historical sales data.

## [6.3.0] - 2026-04-23
### Added
- **Pharmacy Initialization**: Implemented pharmacy-specific categories and subcategories as defaults (Medications, Personal Care, Wellness, Baby & Mother, Medical Supplies).
- **Price-vs-Cost Protection**: Integrated real-time margin validation. SYSTEM now warns when retail/wholesale prices are lower than cost price during inventory entry and receiving.
- **Negative Profit Support**: Enhanced the dashboard to visually indicate losses and negative margins with red alerts and downward icons.
- **Notification History**: Added a history view for dismissed notifications with the ability to restore them directly to the dashboard.
- **Comprehensive Notification View**: Expanded the dashboard's "View All" modal to include a categorized breakdown of all system alerts (Payments, Events, Inventory Warnings).

### Changed
- **Default Branding**: Updated default store name to **PHARMACY-ABC** and synchronized receipt messaging to maintain consistent branding.
- **Financial Utility**: Improved currency formatting to handle negative balances professionally (e.g., `-₦120.00`).
- **Data Migration**: Implemented a one-time migration for existing users to modernize their settings from generic templates to the new pharmacy-focused defaults.

### Fixed
- **Notification Stability**: Resolved a crash (`dismissedHistory.map is not a function`) by implementing robust array validation in the frontend state.

## [6.2.2] - 2026-04-15
### Added
- **Market Orders PDF Export**: Implemented professional PDF report generation for market orders with grouping and filtering support.
- **Date Range Filtering**: Added date range filtering to the Market Orders screen for better order management.

### Fixed
- **Stock Validation**: Added pre-sale stock checks to prevent selling more than available quantity.
- **Database Transactions**: Improved database transaction utility to support returning values, enabling more robust validation logic.

## [6.2.1] - 2026-04-15
### Added
- **Batch & Expiry in New Goods**: Implemented batch number and expiry date tracking during the "Receive New Goods" process.
- **Auto-Inventory Creation**: Receiving a new batch of an existing product now automatically creates a new inventory entry for that batch if it doesn't exist.
- **FIFO Recommendation**: Sales module now recommends the soonest expiring batch first (First-In, First-Out).
- **Expired Product Protection**: Prevented the sale of expired items with a flashing warning and automatic inventory deactivation.

### Changed
- **Dashboard Layout**: Moved the date and time modal upwards, positioning it directly above the greetings for better visibility.
- **Menu Renaming**: Renamed "Purchases" to "New Goods" across the application for clarity.

### Fixed
- **Receive Goods UI**: Fixed modal z-index issues where supplier forms would open behind the receive goods modal.
- **Input Behavior**: Improved numeric inputs in the receive goods section to allow easier clearing and editing.

## [6.2.0] - 2026-04-15
### Added
- **Top Search Bar (Sales)**: Added a prominent search and scan bar at the top of the Sales screen for quicker access.
- **Bulk Upload Merge**: Refined bulk upload logic for Inventory and Payroll to merge data based on SKU/Email instead of replacing entire records.
- **Sample CSV Downloads**: Fixed sample CSV downloads for Inventory and Payroll to work correctly on Android/Capacitor using the `saveFile` utility.

### Fixed
- **Search Responsiveness**: Improved the top search bar in Sales to ensure it actively filters products as the user types.
- **Data Integrity**: Ensured that bulk uploads only update fields provided in the CSV, preserving existing data for missing columns.

## [6.1.0] - 2026-04-14

### Fixed
- **Subcategory Management**: Resolved a bug where subcategories were resetting on every render; implemented `useRef` to ensure they only reset when the category is explicitly changed.
- **Thermal Printing (Android)**: Improved Capacitor printing logic by using the `rawbt:` scheme and optimizing intent triggering to prevent Chrome from opening unnecessarily.
- **Input Validation**: Refined numeric input fields (Price, Cost, Stock) in Inventory and Sales to allow clearing values (empty string) without forceful reset to 0.
- **Expense Filtering**: Fixed date filtering in Expenses to use local date strings, ensuring "Today's Expenses" accurately reflects the current day.

### Changed
- **Dashboard Analytics**: Updated Net Profit calculation to be range-aware, accurately reflecting expenses for the selected time range (Last 24h, 72h, Week, Month).

## [6.0.0] - 2026-04-14

### Added
- **Currency Formatting**: Implemented consistent currency formatting with commas (e.g., 12,000) across the entire application, including Sales, Inventory, Expenses, Accounts, and Reports.
- **Direct Quantity Input**: Users can now directly type the quantity in the sales cart, in addition to using the +/- buttons.
- **Zoom Slider Animation**: Added a fade effect to the zoom slider; it now fades out when not in use and becomes fully opaque on interaction.

### Changed
- **Search Enhancements**: Search bars in Sales and Inventory now correctly recognize product alias names.
- **Dashboard Revenue Overview**: Updated the revenue overview to include expenses and support selectable time ranges (Last 24h, 72h, Week, Month).

### Fixed
- **Expense Accuracy**: Fixed "Today's Expenses" to accurately reflect expenses recorded within the current day by implementing local date handling.
- **Inventory Deletion**: Verified and ensured the delete product/service option in Inventory is fully functional.

## [5.9.0] - 2026-04-13

### Added
- **Smart Barcode Scanning**: Inventory barcode scan now opens the edit modal if the SKU exists, or the "Add New Product" modal with the SKU pre-filled if it doesn't.
- **Cart Removal Confirmation**: Added a confirmation prompt when removing items from the cart, including the item's name.

### Changed
- **Search Behavior**: The search bar in the Sales section now automatically clears after adding an item to the cart (via search or barcode).
- **UI Layout**: Centered all modals and confirmation prompts (e.g., cart removal, account selection) to minimize scrolling and improve accessibility.
- **Default Branding**: Updated the default store name to "STORE-ABC" in the database and initial settings.

### Fixed
- **Sales Barcode Scanning**: Resolved an issue where barcode scans were not correctly adding items to the cart in the Sales section.

## [5.8.0] - 2026-04-12

### Added
- **Branch Management**: Added "Current Store (Main)" and "+ Add New Branch" options directly in the user creation form.
- **Validation**: Implemented uniqueness checks to prevent duplicate names for branches and the main store.
- **Mandatory Setup**: Made store name a required field during the initial setup wizard.

### Changed
- **Username Normalization**: Usernames are now automatically converted to lowercase across the entire application (UI and API).
- **Security**: Implemented automatic session reset and dashboard redirection upon login to prevent unauthorized access to previous sections.
- **Default Store Name**: Updated default store name to "STORE-ABC" throughout the app.

### Fixed
- **Startup Wizard**: Fixed a bug preventing user creation during the initial setup process.
- **Branch Names**: Ensured users assigned to the main store have the store name as their branch name instead of a blank field.
- **React Error**: Resolved `useEffect is not defined` reference error in `App.tsx`.
- **Android Permissions**: Verified `AndroidManifest.xml` permissions and added camera autofocus support.

## [5.7.0] - 2026-04-11

### Added
- **Vertical Zoom Slider**: Implemented a floating vertical zoom slider on the Dashboard for global UI scaling.
- **Settings Integration**: Integrated the Settings button directly into the main sidebar navigation for better accessibility.

### Changed
- **UI Stacking**: Improved z-index hierarchy for dashboard elements and sidebar to prevent mobile navigation overlaps.
- **Layout Refinement**: Optimized bottom spacing and padding to ensure content is fully visible above the mobile footer menu.
- **Zoom Persistence**: Zoom level now persists across sessions via local storage.

### Fixed
- **Content Obstruction**: Resolved an issue where a background spacer was obstructing viewable content at the bottom of pages.
- **Sidebar Accessibility**: Fixed sidebar z-index to ensure it always appears above the bottom navigation on mobile devices.

## [5.6.0] - 2026-04-06

### Added
- **Tutorials Feature**: New section on the side menu with video guides for various app functions.
- **App Versioning**: Added version information (`v5.3.0`) and last updated date to the footer of Login and Signup pages.
- **User State Sync**: Implemented automatic user state synchronization on mount to ensure permissions are always up-to-date.
- **Permissions**: Granted `tutorials` permission to all roles (Admin and Cashier).

### Fixed
- **Mobile Navigation**: Fixed a bug where the "Tutorials" button was not visible on mobile views.
- **Bottom Navigation**: Fixed bottom navigation bar to correctly filter items based on user permissions.
- **Security Settings**: Removed user account area from security settings as requested.

### Changed
- Updated application metadata description.
- Updated `APP_VERSION` to `5.3.0`.
- Updated `LAST_UPDATED` to `2026-04-03`.
