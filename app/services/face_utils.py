"""
Face encoding and comparison utilities.

Uses the `face_recognition` library (dlib-based) to:
  1. Detect faces in images
  2. Generate 128-dimensional face encodings
  3. Compare live captures against stored encodings

Encodings are serialized with numpy.tobytes() / np.frombuffer() rather
than pickle — this is both safer (no arbitrary code execution on
deserialization) and more compact.
"""

import base64
import binascii
import io
import numpy as np
import face_recognition
from PIL import Image


def _decode_base64_to_rgb(base64_str: str) -> np.ndarray:
    """
    Decode a base64 JPEG string into an RGB numpy array
    compatible with face_recognition (which expects HxWx3 uint8).
    """
    # Strip optional data-URI prefix (e.g. "data:image/jpeg;base64,...")
    if "," in base64_str:
        base64_str = base64_str.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(base64_str)
    except binascii.Error:
        raise ValueError("Invalid image data")
        
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return np.array(image)


def _find_face_locations(rgb_image: np.ndarray) -> list[tuple[int, int, int, int]]:
    """
    Try multiple face detection fallbacks for better enrollment reliability.

    Uses HOG first for speed, then an upsampled HOG pass, and finally CNN
    only if the other options fail. This improves robustness on varied
    lighting and off-angle captures.
    """
    face_locations = face_recognition.face_locations(rgb_image, model="hog")
    if face_locations:
        return face_locations

    face_locations = face_recognition.face_locations(
        rgb_image,
        number_of_times_to_upsample=1,
        model="hog",
    )
    if face_locations:
        return face_locations

    try:
        face_locations = face_recognition.face_locations(rgb_image, model="cnn")
    except Exception:
        face_locations = []

    return face_locations


def encode_faces(base64_images: list[str]) -> bytes:
    """
    Process 3-5 face images and return a single averaged encoding
    serialized as raw bytes.

    Averaging multiple encodings reduces noise from pose/lighting
    differences and produces a more robust reference template.

    Raises:
        ValueError: If any image contains zero or multiple faces,
                    or if no valid encodings could be extracted.
    """
    encodings: list[np.ndarray] = []

    for i, b64 in enumerate(base64_images):
        rgb_image = _decode_base64_to_rgb(b64)
        
        face_locations = _find_face_locations(rgb_image)

        if len(face_locations) == 0:
            raise ValueError(
                f"Face not clear in Photo {i + 1}. Please ensure your whole face is visible and look slightly more towards the camera."
            )
        
        if len(face_locations) > 1:
            raise ValueError(
                f"Multiple people detected in Photo {i + 1}. "
                "Please ensure you are alone in the frame during enrollment."
            )

        # face_encodings returns a list; we know there's exactly 1 face
        encoding = face_recognition.face_encodings(rgb_image, face_locations, num_jitters=0)[0]
        encodings.append(encoding)

    if not encodings:
        raise ValueError("Could not extract any face encodings")

    # Average across all images → single 128-d vector
    avg_encoding = np.mean(encodings, axis=0)

    # Serialize as raw float64 bytes (128 * 8 = 1024 bytes, very compact)
    return avg_encoding.tobytes()


def compare_face(
    stored_blob: bytes,
    base64_image: str,
    tolerance: float = 0.5,
) -> tuple[bool, float]:
    """
    Compare a stored face encoding against a new image.

    Args:
        stored_blob: Raw bytes of the stored 128-d encoding.
        base64_image: Base64-encoded JPEG of the face to verify.
        tolerance: Maximum L2 distance to consider a match.
                   Default 0.5 is slightly stricter than the
                   library default of 0.6 — better for attendance
                   where false positives are worse than false negatives.

    Returns:
        (is_match, distance) — distance is the L2 norm between encodings.

    Raises:
        ValueError: If the new image has no detectable face.
    """
    # Reconstruct the stored 128-d float64 vector
    stored_encoding = np.frombuffer(stored_blob, dtype=np.float64)

    # Encode the new image
    rgb_image = _decode_base64_to_rgb(base64_image)
    face_locations = _find_face_locations(rgb_image)

    if len(face_locations) == 0:
        raise ValueError("No face detected in the verification image")
    if len(face_locations) > 1:
        raise ValueError("Multiple faces detected. Please ensure you are alone in frame.")

    # Use the only face found
    new_encoding = face_recognition.face_encodings(rgb_image, face_locations)[0]

    # Euclidean distance between the two 128-d vectors
    distance = float(np.linalg.norm(stored_encoding - new_encoding))
    is_match = distance <= tolerance

    return is_match, distance


def encode_single_face(base64_image: str) -> bytes:
    """
    Extract one 128-d face encoding from a single image and return as float64 bytes.
    """
    rgb_image = _decode_base64_to_rgb(base64_image)
    face_locations = _find_face_locations(rgb_image)
    if len(face_locations) == 0:
        raise ValueError("No face detected in the image")
    if len(face_locations) > 1:
        raise ValueError("Multiple faces detected. Please ensure you are alone in frame.")
    encoding = face_recognition.face_encodings(rgb_image, face_locations, num_jitters=0)[0]
    return encoding.astype(np.float64).tobytes()


def merge_face_encoding(stored_blob: bytes, base64_image: str) -> bytes:
    """
    Average the stored encoding with a new face capture (for instructor-led learning).
    """
    stored = np.frombuffer(stored_blob, dtype=np.float64)
    new_vec = np.frombuffer(encode_single_face(base64_image), dtype=np.float64)
    merged = (stored + new_vec) / 2.0
    return merged.astype(np.float64).tobytes()
