import '../core/files/file_source.dart';
import '../core/network/api_client.dart';
import '../core/network/api_exception.dart';
import '../core/network/guarded.dart';
import '../core/network/json.dart';

/// Uploads: reserve a slot for the file, then send the bytes to the signed
/// address the reservation returns. The asset id is what other requests —
/// a seller application, a product — refer to.
class MediaRepository {
  const MediaRepository(this._api);

  final ApiClient _api;

  /// The API's default limit (`MEDIA_MAX_FILE_SIZE_BYTES`).
  static const maxBytes = 10 * 1024 * 1024;

  Future<String> upload(PickedFile file) async {
    if (file.size > maxBytes) {
      throw const ApiException(
        kind: ApiErrorKind.http,
        statusCode: 400,
        message: 'That file is over 10 MB. Choose a smaller one.',
      );
    }
    final data = await _api.post(
      '/media/uploads',
      body: {
        'fileName': file.name,
        'mimeType': file.mimeType,
        'byteSize': file.size,
      },
    );
    final (id, url) = parseResponse(() {
      final json = asJson(data);
      return (json.obj('asset').str('id'), json.obj('upload').str('url'));
    });
    // The signed address is API-relative (`/api/v1/media/…?expires&…`);
    // the client adds its own base, so drop the API's prefix.
    final signed = Uri.parse(url);
    await _api.putFile(
      signed.path.replaceFirst(RegExp(r'^/api/v1'), ''),
      query: signed.queryParameters,
      field: 'file',
      fileName: file.name,
      contentType: file.mimeType,
      bytes: file.bytes,
    );
    return id;
  }
}
