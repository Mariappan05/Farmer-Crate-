import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const CLOUDINARY_CLOUD_NAME = 'dcwpr28uf';
const CLOUDINARY_API_KEY = '334646742262894';
const CLOUDINARY_API_SECRET = 'QlFJbjla0epfpzpTib6R0STIEFg';
const CLOUDINARY_FOLDER = 'farmer_crate';

/**
 * Upload a local image URI to Cloudinary.
 * Returns the secure_url string or null on failure.
 */
export const uploadImageToCloudinary = async (imageUri) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `folder=${CLOUDINARY_FOLDER}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    const signature = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA1,
      paramsToSign
    );

    const formData = new FormData();
    const filename = imageUri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename ?? '');
    const mimeType = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('file', { uri: imageUri, name: filename, type: mimeType });
    formData.append('api_key', CLOUDINARY_API_KEY);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
    formData.append('folder', CLOUDINARY_FOLDER);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );
    const result = await response.json();
    if (response.ok && result.secure_url) return result.secure_url;
    console.error('Cloudinary error:', result);
    return null;
  } catch (e) {
    console.error('uploadImageToCloudinary error:', e);
    return null;
  }
};

/**
 * Open image picker and return uri. Returns null if cancelled.
 */
export const pickImage = async (fromCamera = false) => {
  const { status } = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== 'granted') {
    return null;
  }

  const result = fromCamera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });

  if (!result.canceled && result.assets?.length > 0) {
    return result.assets[0].uri;
  }
  return null;
};

/**
 * Append Cloudinary transformation to URL.
 */
export const optimizeImageUrl = (url, { width, height } = {}) => {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return url;
  const transformations = ['q_auto', 'f_auto'];
  if (width) transformations.push(`w_${width}`);
  if (height) transformations.push(`h_${height}`);
  return url.replace('/upload/', `/upload/${transformations.join(',')}/`);
};
