import 'package:flutter/widgets.dart';

import '../../core/files/file_source.dart';
import '../../core/network/api_exception.dart';
import '../../data/media_repository.dart';
import '../../design/design.dart';

enum UploadState { uploading, done, failed }

class Upload {
  Upload(this.file);

  final PickedFile file;
  UploadState state = UploadState.uploading;
  String? assetId;
  String? error;
}

/// Files being attached to something — application documents, product
/// photos. Each uploads the moment it is chosen, so submitting later is
/// quick and a failure shows against the file that failed.
class Uploads extends ChangeNotifier {
  Uploads({
    required FileSource files,
    required MediaRepository media,
    required this.kinds,
    this.max = 10,
  }) : _files = files,
       _media = media;

  final FileSource _files;
  final MediaRepository _media;
  final Set<FileKind> kinds;
  final int max;

  final List<Upload> _items = [];
  String? _pickError;
  bool _disposed = false;

  List<Upload> get items => List.unmodifiable(_items);
  String? get pickError => _pickError;
  bool get canAdd => _items.length < max;
  bool get busy => _items.any((u) => u.state == UploadState.uploading);
  List<String> get assetIds => [
    for (final u in _items)
      if (u.state == UploadState.done) u.assetId!,
  ];
  bool get allDone =>
      _items.isNotEmpty && _items.every((u) => u.state == UploadState.done);

  Future<void> add() async {
    if (!canAdd) return;
    _pickError = null;
    final PickedFile? file;
    try {
      file = await _files.pick(kinds);
    } on FormatException catch (error) {
      _pickError = error.message;
      _notify();
      return;
    } catch (_) {
      _pickError = "Couldn't open that file. Try another.";
      _notify();
      return;
    }
    if (file == null) return;
    final upload = Upload(file);
    _items.add(upload);
    await _send(upload);
  }

  Future<void> retry(Upload upload) => _send(upload);

  void remove(Upload upload) {
    _items.remove(upload);
    _notify();
  }

  Future<void> _send(Upload upload) async {
    upload
      ..state = UploadState.uploading
      ..error = null;
    _notify();
    try {
      upload
        ..assetId = await _media.upload(upload.file)
        ..state = UploadState.done;
    } catch (error) {
      upload
        ..state = UploadState.failed
        ..error = describeError(error);
    }
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

String _size(int bytes) => bytes >= 1024 * 1024
    ? '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB'
    : '${(bytes / 1024).ceil()} KB';

/// The files in an [Uploads], each with how it is going, and a row to add
/// another.
class UploadList extends StatelessWidget {
  const UploadList({
    super.key,
    required this.uploads,
    required this.title,
    required this.addLabel,
    this.footer,
    this.error,
  });

  final Uploads uploads;
  final String title;
  final String addLabel;
  final String? footer;

  /// A problem with the list as a whole: "Add at least one document".
  final String? error;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: uploads,
      builder: (context, _) {
        final problem = uploads.pickError ?? error;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            InsetGroup(
              title: title,
              footer: footer,
              children: [
                for (final u in uploads.items)
                  ListRow(
                    leading: u.file.mimeType == 'application/pdf'
                        ? Glyphs.receipt
                        : Glyphs.image,
                    title: u.file.name,
                    subtitle: switch (u.state) {
                      UploadState.uploading => 'Uploading…',
                      UploadState.done => _size(u.file.size),
                      UploadState.failed => '${u.error} Tap to try again.',
                    },
                    destructive: u.state == UploadState.failed,
                    showChevron: false,
                    onPressed: u.state == UploadState.failed
                        ? () => uploads.retry(u)
                        : null,
                    trailing: u.state == UploadState.uploading
                        ? const Spinner(size: 20)
                        : IconAction(
                            icon: Glyphs.close,
                            semanticLabel: 'Remove ${u.file.name}',
                            size: 20,
                            onPressed: () => uploads.remove(u),
                          ),
                  ),
                if (uploads.canAdd)
                  ListRow(
                    leading: Glyphs.add,
                    title: addLabel,
                    showChevron: false,
                    onPressed: uploads.add,
                  ),
              ],
            ),
            if (problem != null) ...[
              const SizedBox(height: Space.x2),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Space.x4),
                child: Text(
                  problem,
                  style: context.type.caption.copyWith(
                    color: context.colors.danger,
                  ),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
