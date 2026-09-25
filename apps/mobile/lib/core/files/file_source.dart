import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

/// A file the user chose, read into memory. Uploads here are small — the
/// API caps them at 10 MB — so holding the bytes is simpler than streaming.
class PickedFile {
  const PickedFile({
    required this.name,
    required this.bytes,
    required this.mimeType,
  });

  final String name;
  final Uint8List bytes;
  final String mimeType;

  int get size => bytes.length;
}

/// Where files come from. The app uses the platform's own picker; tests
/// hand over bytes directly.
abstract interface class FileSource {
  /// Lets the user choose one file among [kinds]; null if they cancel.
  Future<PickedFile?> pick(Set<FileKind> kinds);
}

enum FileKind { image, pdf }

/// The file types the API accepts, by extension.
const _mimeTypes = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
  'pdf': 'application/pdf',
};

String? mimeTypeFor(String fileName) {
  final dot = fileName.lastIndexOf('.');
  if (dot < 0) return null;
  return _mimeTypes[fileName.substring(dot + 1).toLowerCase()];
}

/// The platform picker: the Files app on iOS (which reaches Photos and
/// iCloud too), the system document picker on Android. No photo-library
/// permission is needed for either.
class PlatformFileSource implements FileSource {
  const PlatformFileSource();

  @override
  Future<PickedFile?> pick(Set<FileKind> kinds) async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: [
        if (kinds.contains(FileKind.image)) ...['jpg', 'jpeg', 'png', 'webp'],
        if (kinds.contains(FileKind.pdf)) 'pdf',
      ],
      withData: true,
    );
    final file = result?.files.singleOrNull;
    final bytes = file?.bytes;
    if (file == null || bytes == null) return null;
    final mime = mimeTypeFor(file.name);
    if (mime == null) {
      throw const FormatException('Choose a JPEG, PNG, WebP or PDF file.');
    }
    return PickedFile(name: file.name, bytes: bytes, mimeType: mime);
  }
}
