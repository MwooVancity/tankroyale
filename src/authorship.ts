export const PROJECT_CREATOR = 'Michael Woo';
export const PROJECT_CREATOR_DISPLAY = 'Michael Woo';
export const PROJECT_CREATOR_URL = 'https://github.com/mwoo778';
export const PROJECT_COPYRIGHT = 'Copyright © 2026 Michael Woo';
export const PROJECT_PACKAGE_LICENSE = 'MIT';
export const FIRST_PARTY_LICENSE = 'MIT';

export interface FirstPartyVehicleAuthorship {
  creator: string;
  creatorUrl: string;
  copyright: string;
  license: string;
  geometry: 'first-party-procedural';
  runtimeExternalGeometry: false;
}

export const FIRST_PARTY_VEHICLE_AUTHORSHIP: Readonly<FirstPartyVehicleAuthorship> = Object.freeze({
  creator: PROJECT_CREATOR,
  creatorUrl: PROJECT_CREATOR_URL,
  copyright: PROJECT_COPYRIGHT,
  license: FIRST_PARTY_LICENSE,
  geometry: 'first-party-procedural',
  runtimeExternalGeometry: false,
});
