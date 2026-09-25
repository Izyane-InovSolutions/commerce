import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/widgets.dart';

import 'app/app.dart';
import 'app/services.dart';
import 'firebase_options.dart';

export 'app/app.dart' show CommerceApp;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Firebase carries Analytics and App Distribution's tester updates; the
  // shop works without it, so a failure here must not stop the app.
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (_) {}
  final services = await AppServices.create();
  // Not awaited: the router holds the startup screen until this settles, so
  // the first frame is never blocked on the network.
  services.session.restore();
  runApp(CommerceApp(services: services));
}
