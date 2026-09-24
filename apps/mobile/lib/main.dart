import 'package:flutter/material.dart';

import 'app/app.dart';
import 'app/services.dart';

export 'app/app.dart' show CommerceApp;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final services = await AppServices.create();
  // Not awaited: the router holds the startup screen until this settles, so
  // the first frame is never blocked on the network.
  services.session.restore();
  runApp(CommerceApp(services: services));
}
