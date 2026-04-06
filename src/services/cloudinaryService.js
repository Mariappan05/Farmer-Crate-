import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const CLOUDINARY_CLOUD_NAME = 'dcwpr28uf';
const CLOUDINARY_API_KEY = '334646742262894';
const CLOUDINARY_API_SECRET = 'QlFJbjla0epfpzpTib6R0STIEFg';
const CLOUDINARY_FOLDER = 'farmer_crate';
const CLOUDINARY_UPLOAD_TIMEOUT_MS = 45000;

const withTimeout = async (promise, timeoutMs = CLOUDINARY_UPLOAD_TIMEOUT_MS, message = 'Upload timed out') => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const detectMimeType = (uri, fallback = 'application/octet-stream') => {
  const name = (uri || '').split('/').pop() || '';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
  };
  return map[ext] || fallback;
};

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
    const filename = imageUri.split('/').pop() || `image_${Date.now()}.jpg`;
    const mimeType = detectMimeType(imageUri, 'image/jpeg');

    formData.append('file', { uri: imageUri, name: filename, type: mimeType });
    formData.append('api_key', CLOUDINARY_API_KEY);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
    formData.append('folder', CLOUDINARY_FOLDER);

    const response = await withTimeout(
      fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      ),
      CLOUDINARY_UPLOAD_TIMEOUT_MS,
      'Image upload timed out'
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
 * Upload a local media URI (image/video) to Cloudinary.
 * resourceType can be 'image', 'video', 'raw', or 'auto'.
 */
export const uploadMediaToCloudinary = async (mediaUri, resourceType = 'auto') => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `folder=${CLOUDINARY_FOLDER}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    const signature = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA1,
      paramsToSign
    );

    const formData = new FormData();
    const filename = mediaUri.split('/').pop() || `upload_${Date.now()}`;
    const fallbackMime = resourceType === 'video' ? 'video/mp4' : 'application/octet-stream';
    const mimeType = detectMimeType(mediaUri, fallbackMime);

    formData.append('file', { uri: mediaUri, name: filename, type: mimeType });
    formData.append('api_key', CLOUDINARY_API_KEY);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
    formData.append('folder', CLOUDINARY_FOLDER);

    const response = await withTimeout(
      fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
        { method: 'POST', body: formData }
      ),
      CLOUDINARY_UPLOAD_TIMEOUT_MS,
      'Media upload timed out'
    );
    const result = await response.json();
    if (response.ok && result.secure_url) return result.secure_url;
    console.error('Cloudinary media upload error:', result);
    return null;
  } catch (e) {
    console.error('uploadMediaToCloudinary error:', e);
    return null;
  }
};

export const uploadVideoToCloudinary = async (videoUri) => {
  return uploadMediaToCloudinary(videoUri, 'video');
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
 * Open video picker and return uri. Returns null if cancelled.
 */
export const pickVideo = async (fromCamera = false) => {
  const { status } = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== 'granted') {
    return null;
  }

  const result = fromCamera
    ? await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      quality: 0.7,
      allowsEditing: false,
    })
    : await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.7,
      allowsEditing: false,
    });

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
