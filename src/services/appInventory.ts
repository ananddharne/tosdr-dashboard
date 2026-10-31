// "Your Apps" source — the single interface behind the dashboard list.
//
// The dashboard never asks "what apps are installed?" directly. It asks
// this module, so the source can be swapped without touching any screen.
//
// Current implementation: manual adding. listInstalledApps() returns an
// empty list, and the user's apps are exactly the services they followed
// in Add apps. This is the only implementation that works on iOS, where
// no API exists that lists installed apps, even with user consent.
//
// --- ANDROID NATIVE PLUG-IN POINT ---------------------------------------
// To populate "Your Apps" automatically on Android, replace
// ManualAppInventory below with a native-module implementation:
//
//   1. Add a native module (e.g. via an Expo config plugin) that calls
//      PackageManager.getInstalledApplications() and returns the app
//      labels + package names through the same InstalledApp shape.
//   2. To see *all* installed apps (not just the filtered set Android
//      shows by default), the app must declare the QUERY_ALL_PACKAGES
//      permission in AndroidManifest.xml.
//   3. Google Play treats QUERY_ALL_PACKAGES as a sensitive permission:
//      it is only permitted when the app's core functionality requires
//      broad visibility, and you MUST file a Permissions Declaration
//      Form in Play Console justifying it. This app's core purpose — a
//      dashboard of the user's own apps — is the justification, but the
//      declaration is still required and review can refuse it.
//   4. Keep the on-device matching local: map package names to ToS;DR
//      services on the phone; never upload the installed-app list anywhere.
//
// iOS must keep using the manual implementation: there is no equivalent
// permission or API, and URL-scheme probing / Screen Time tokens cannot
// be converted into service identities.

export interface InstalledApp {
  packageName: string;
  label: string;
}

export interface AppInventory {
  /**
   * Apps detected on this device. Returns [] when detection is not
   * available (manual build, iOS, or permission not granted).
   */
  getInstalledApps(): Promise<InstalledApp[]>;
  /** Human-readable description of the active source, shown in the UI. */
  readonly sourceLabel: string;
}

class ManualAppInventory implements AppInventory {
  readonly sourceLabel = 'Manual — apps you add yourself';

  async getInstalledApps(): Promise<InstalledApp[]> {
    return [];
  }
}

// ANDROID PLUG-IN POINT: swap this single line for the native
// implementation (see the comment block above) to enable auto-detection.
export const appInventory: AppInventory = new ManualAppInventory();
