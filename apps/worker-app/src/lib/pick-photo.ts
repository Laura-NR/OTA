import * as ImagePicker from 'expo-image-picker';

import { photoUpload, type PhotoUpload } from './credentials';

/**
 * A photo of a document from the camera or the gallery (W-Credentials V6a).
 * A JPEG quality of 0.6 keeps a phone photo near 1 MB. On the web preview
 * (screenshots and e2e only) both open a file input. Resolves to null when
 * the worker cancels, and to `'denied'` without camera permission.
 */
export async function pickPhoto(
  source: 'camera' | 'library',
): Promise<PhotoUpload | 'denied' | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
    exif: false,
  };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'denied';
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const [asset] = result.assets;
  return asset ? photoUpload(asset) : null;
}
