import 'package:commerce_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders the Commerce app', (tester) async {
    await tester.pumpWidget(const CommerceApp());

    expect(find.text('Commerce'), findsOneWidget);
    expect(find.text('Your marketplace starts here.'), findsOneWidget);
  });
}
